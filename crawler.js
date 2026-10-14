// 八方报价单爬虫 v2
// 修复：Cookie 反爬 + 基于 addCartFxsp 结构化解析
// 运行：node crawler.js

const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://www.lzbftx.vip';
const QUOTE_URL = BASE_URL + '/quoteList.action';
const MAX_REDIRECTS = 20;

// 带 Cookie 管理的 fetch
class CookieJar {
  constructor() {
    this.cookies = {};
  }

  setFromHeaders(headers) {
    const setCookie = headers.getSetCookie ? headers.getSetCookie() : [];
    setCookie.forEach(cookieStr => {
      const [pair] = cookieStr.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        this.cookies[name] = value;
      }
    });
  }

  toString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

// 跟随重定向并保持 Cookie
async function fetchWithCookies(url, cookieJar, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('重定向次数超限');
  }

  const res = await fetch(url, {
    redirect: 'manual',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cookie': cookieJar.toString(),
    }
  });

  cookieJar.setFromHeaders(res.headers);

  // 处理重定向
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) throw new Error('重定向缺少 Location');

    let nextUrl = location;
    if (location.startsWith('/')) {
      nextUrl = BASE_URL + location;
    } else if (location.startsWith('?')) {
      nextUrl = url.split('?')[0] + location;
    }

    // 小延迟，避免被识别为爬虫
    await new Promise(r => setTimeout(r, 200));

    return fetchWithCookies(nextUrl, cookieJar, redirectCount + 1);
  }

  return res;
}

// 从 HTML 提取品牌分区
function extractSections(html) {
  const sections = [];
  // <tr><th colspan="10" class="text-center">苹果</th></tr>
  const thRegex = /<tr>\s*<th[^>]*class="text-center"[^>]*>\s*([^<]+?)\s*<\/th>\s*<\/tr>/g;
  let match;
  while ((match = thRegex.exec(html)) !== null) {
    sections.push({
      name: match[1].trim(),
      index: match.index
    });
  }
  return sections;
}

// 根据位置找到产品所属的品牌
function findBrandForIndex(sections, index) {
  let current = 'unknown';
  for (const s of sections) {
    if (s.index <= index) {
      current = s.name;
    } else {
      break;
    }
  }
  return current;
}

// 品牌名映射
function mapBrand(sectionName) {
  if (sectionName.includes('苹果')) return { brand: 'apple', category: sectionName };
  if (sectionName.includes('华为ND')) return { brand: 'huawei', category: '华为ND' };
  if (sectionName.includes('华为全国')) return { brand: 'huawei', category: '华为全国' };
  if (sectionName.includes('华为')) return { brand: 'huawei', category: sectionName };
  if (sectionName.includes('小米') || sectionName.includes('红米')) return { brand: 'xiaomi', category: sectionName };
  if (sectionName.includes('OPPO')) return { brand: 'oppo', category: sectionName };
  if (sectionName.includes('vivo')) return { brand: 'vivo', category: sectionName };
  if (sectionName.includes('荣耀')) return { brand: 'honor', category: sectionName };
  if (sectionName.includes('三星')) return { brand: 'samsung', category: sectionName };
  return { brand: 'unknown', category: sectionName };
}

// 从 addCartFxsp 提取产品
function extractProducts(html, sections) {
  const products = [];
  // addCartFxsp(this,'68549','59219','产品名','9330.00','sl68549',...)
  const regex = /addCartFxsp\(this\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const productId = match[1];      // 68549
    const shopId = match[2];         // 59219
    const rawName = match[3];        // 产品名
    const priceStr = match[4];       // 9330.00
    const stockId = match[5];        // sl68549

    const price = parseFloat(priceStr);
    if (isNaN(price)) continue;

    // 找到所属品牌分区
    const sectionName = findBrandForIndex(sections, match.index);
    const { brand, category } = mapBrand(sectionName);

    const product = buildProduct(productId, brand, category, rawName, price, shopId);
    products.push(product);
  }

  return products;
}

// 构建产品对象
function buildProduct(productId, brand, category, rawName, price, shopId) {
  let name = rawName;
  let channel = '*';
  let color = '';
  let storage = '';
  let model = '';
  let sku = '';
  const tags = [];

  // 渠道识别
  if (name.includes('(官网)')) {
    channel = '官网';
    tags.push('原封');
  } else if (name.includes('兰州激活')) {
    channel = '兰州激活';
    tags.push('激活');
  } else if (name.includes('仅激活')) {
    channel = '仅激活';
    tags.push('激活');
  } else if (name.includes('国补')) {
    channel = '国补';
    tags.push('国补');
  } else if (name.includes('原封')) {
    channel = '*';
    tags.push('原封');
  } else {
    tags.push('原封');
  }

  // 缺货占位价
  if (price < 100) {
    tags.push('缺货');
  }

  // 型号编码（如3715）
  const modelMatch = name.match(/\((\d{4})\)/);
  if (modelMatch) model = modelMatch[1];

  // SKU 编码（如T74/TQ4）
  const skuMatch = name.match(/\(([A-Z0-9]{3,4}\/[A-Z0-9]{3,4})\)/);
  if (skuMatch) sku = skuMatch[1];

  // 容量（优先匹配 "12+512GB" 中的 512GB，其次匹配 "-256GB"）
  let storageMatch = name.match(/\+\s*(\d+(?:GB|G|TB|T))\b/i);
  if (!storageMatch) storageMatch = name.match(/[-\s](\d+(?:GB|G|TB|T))\b/i);
  if (storageMatch) {
    storage = storageMatch[1].toUpperCase();
    if (storage === 'G') storage = 'GB';
    if (storage === 'T') storage = 'TB';
  }

  // 颜色
  const colors = [
    '黑色', '白色', '银色', '酒红色', '冰川蓝色', '深空黑色', '云白色', '浅金色', '天蓝色',
    '青雾蓝色', '薰衣草紫色', '鼠尾草绿色', '星宇橙色', '深蓝色', '雪域白', '曜石黑',
    '云杉绿', '风信紫', '罗兰紫', '丝绒黑', '金丝银锦', '羽衣白', '曜金黑', '晶钻白',
    '琥珀橙', '翡冷翠', '极地银', '极光青', '零度白', '月影灰', '型格红', '釉黑', '釉白',
    '釉红', '釉青', '鎏光黑', '鎏光金', '亚麻灰', '幻夜黑', '晨曦金', '粉红芭乐',
    '桑果黑', '椰青白', '橘子汽水', '晶格粉', '晶格绿', '玫瑰金', '霞光紫', '橘子海',
    '翡翠湖', '冰晶蓝', '凝霜白', '羽砂黑', '冰晶粉', '浮光金', '带感绿', '好搭紫',
    '珊瑚橙', '羽沙白', '星海蓝', '飞天青', '破晓橙', '樱雪晴空', '幻彩贝母', '晴空蓝',
    '天际白', '星空黑', '向新绿', '流沙金', '珍珠白', '流光金', '午夜色', '星光色',
    '靛蓝色', '柑橘黄色', '桃粉色', '水蓝色', '浅紫色', '雪山粉', '冰融蓝', '暗影黑',
    '星云白', '星云灰', '寰宇红', '寰宇蓝', '云锦白', '云锦蓝', '幻影紫', '波尔多红',
    '星际蓝', '跃影红', '活力橙', '橄榄金', '灵盾防窥屏', '深空灰', '钛黑色', '钛原色'
  ];
  for (const c of colors) {
    if (name.includes(c)) {
      color = c;
      break;
    }
  }

  // 清理名称末尾的 * 和渠道标注
  let cleanName = name
    .replace(/\*+$/, '')
    .replace(/\(官网\)/g, '')
    .replace(/\(兰州激活\)/g, '')
    .replace(/\(仅激活\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 唯一 ID
  const id = [brand, model || productId, storage, color, channel]
    .map(s => String(s).replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase())
    .join('-');

  return {
    id,
    sourceId: productId,
    shopId,
    brand,
    category,
    name: cleanName,
    model,
    sku,
    color,
    storage,
    channel,
    price,
    tags
  };
}

// 主函数
async function main() {
  console.log('开始爬取八方报价单...');
  const cookieJar = new CookieJar();

  const res = await fetchWithCookies(QUOTE_URL, cookieJar);
  const html = await res.text();
  console.log(`页面大小: ${html.length} 字符`);

  // 提取品牌分区
  const sections = extractSections(html);
  console.log(`发现 ${sections.length} 个分区:`, sections.map(s => s.name).join(', '));

  // 提取产品
  const products = extractProducts(html, sections);
  console.log(`解析到 ${products.length} 个产品`);

  // 品牌统计
  const stats = {};
  products.forEach(p => {
    const key = `${p.brand}(${p.category})`;
    stats[key] = (stats[key] || 0) + 1;
  });
  console.log('分区统计:');
  Object.entries(stats).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // 价格区间
  const validPrices = products.filter(p => p.price >= 100).map(p => p.price);
  if (validPrices.length) {
    console.log(`价格区间: ￥${Math.min(...validPrices)} ~ ￥${Math.max(...validPrices)}`);
  }

  // 生成时间
  const now = new Date();
  const updateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const output = {
    updateTime,
    source: QUOTE_URL,
    count: products.length,
    products
  };

  const outPath = path.join(__dirname, 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n已写入 ${outPath}`);
}

main().catch(err => {
  console.error('爬取失败:', err.message);
  process.exit(1);
});
