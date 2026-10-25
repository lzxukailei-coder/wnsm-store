// 八方报价单爬虫 v3（全分类版）
// 遍历全部二级分类（km 参数），覆盖苹果/华为/小米/荣耀/VIVO/OPPO/三星/摩托罗拉/
// 大疆/平板/手表/耳机/笔记本/配件等；按 sourceId 去重。
// 运行：node crawler.js

const fs = require('fs');
const path = require('path');
const { CaptchaSolver } = require('./captcha');

const BASE_URL = 'http://www.lzbftx.vip';
const QUOTE_URL = BASE_URL + '/quoteList.action';
const LOGIN_URL = BASE_URL + '/index.htm?ykflag=Y';
const MAX_REDIRECTS = 20;
const REQ_DELAY = 400; // 每个分类请求间隔，防反爬
const LOGIN_MAX_RETRY = 8; // 验证码 OCR 失败重试次数
// 八方登录凭证仅从环境变量读取（在 GitHub Secrets / 本地环境注入，不写入仓库）
const BF_USER = process.env.BF_USER;
const BF_PASS = process.env.BF_PASS;

// 全部二级分类（一个品牌/品类一个请求）
const CATEGORIES = [
  '贸易机.苹果', '贸易机.三星',
  '国产机.OPPO', '国产机.VIVO', '国产机.功能机',
  '国产机.华为', '国产机.华为ND', '国产机.华为全国',
  '国产机.小米', '国产机.摩托罗拉', '国产机.荣耀',
  '大疆.大疆',
  '融合.华为融合', '融合.安顿', '融合.小米融合',
  '融合.苹果融合', '融合.荣耀融合',
  '配件.SKG', '配件.华为配件', '配件.小度配件', '配件.小米配件', '配件.苹果配件'
];

// ===== Cookie 管理（应对八方 JSESSIONID 重定向反爬）=====
class CookieJar {
  constructor() { this.cookies = {}; }
  setFromHeaders(headers) {
    const setCookie = headers.getSetCookie ? headers.getSetCookie() : [];
    setCookie.forEach(cookieStr => {
      const [pair] = cookieStr.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) {
        this.cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
    });
  }
  toString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function fetchWithCookies(url, cookieJar, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) throw new Error('重定向次数超限');
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
  if (res.status >= 300 && res.status < 400) {
    let location = res.headers.get('location');
    if (!location) throw new Error('重定向缺少 Location');
    if (location.startsWith('/')) location = BASE_URL + location;
    else if (location.startsWith('?')) location = url.split('?')[0] + location;
    await new Promise(r => setTimeout(r, 250));
    return fetchWithCookies(location, cookieJar, redirectCount + 1);
  }
  return res;
}

// ===== 解析：th 分区 + 产品，并根据位置确定分区 =====
function extractSections(html) {
  const sections = [];
  const thRegex = /<tr>\s*<th[^>]*class="text-center"[^>]*>\s*([^<]+?)\s*<\/th>\s*<\/tr>/g;
  let match;
  while ((match = thRegex.exec(html))) {
    sections.push({ name: match[1].trim(), index: match.index });
  }
  return sections;
}

function findSectionForIndex(sections, index) {
  let current = sections.length ? sections[0].name : '其他';
  for (const s of sections) {
    if (s.index <= index) current = s.name;
    else break;
  }
  return current;
}

// 品牌归类（依据分区名）
function mapBrand(category, rawName) {
  const c = category || '';
  const n = rawName || '';
  if (c.includes('苹果')) return 'apple';
  if (c.includes('华为')) return 'huawei';
  if (c.includes('小米') || c.includes('红米') || n.includes('小米') || n.includes('红米')) return 'xiaomi';
  if (c.includes('荣耀') || n.includes('荣耀')) return 'honor';
  if (c.includes('VIVO') || c.includes('vivo') || n.includes('vivo') || n.includes('iQOO') || n.includes('IQOO')) return 'vivo';
  if (c.includes('OPPO') || n.includes('OPPO') || n.includes('一加')) return 'oppo';
  if (c.includes('三星') || n.includes('三星')) return 'samsung';
  if (c.includes('摩托罗拉') || n.includes('摩托罗拉') || n.includes('moto') || n.includes('razr')) return 'motorola';
  if (c.includes('大疆') || n.includes('大疆')) return 'dji';
  if (c.includes('诺基亚') || n.includes('诺基亚')) return 'nokia';
  if (c.includes('百合') || n.includes('百合')) return 'baihe';
  if (c.includes('小度') || n.includes('小度')) return 'xiaodu';
  if (c.includes('SKG') || n.includes('SKG')) return 'skg';
  if (c.includes('安顿') || n.includes('安顿')) return 'andun';
  if (n.includes('小天才') || n.includes('科大讯飞') || n.includes('作业帮')) return 'edu';
  return 'other';
}

// 从 addCartFxsp 提取产品（带分区）
function extractProducts(html, sections) {
  const list = [];
  const regex = /addCartFxsp\(this\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'/g;
  let match;
  while ((match = regex.exec(html))) {
    const productId = match[1];
    const shopId = match[2];
    const rawName = match[3];
    const priceStr = match[4];
    const price = parseFloat(priceStr);
    if (isNaN(price)) continue;
    const category = findSectionForIndex(sections, match.index);
    list.push({ productId, shopId, rawName, price, category });
  }
  return list;
}

// 构建产品对象
function buildProduct(p, brand, category) {
  const rawName = p.rawName;
  let name = rawName;
  let channel = '*';
  let color = '';
  let storage = '';
  let model = '';
  let sku = '';
  const tags = [];

  // 渠道识别
  if (name.includes('(官网)')) { channel = '官网'; tags.push('原封'); }
  else if (name.includes('兰州激活')) { channel = '兰州激活'; tags.push('激活'); }
  else if (name.includes('仅激活')) { channel = '仅激活'; tags.push('激活'); }
  else if (name.includes('国补')) { channel = '国补'; tags.push('国补'); }
  else if (name.includes('原封')) { channel = '*'; tags.push('原封'); }
  else { tags.push('原封'); }

  // 缺货占位价
  if (p.price < 100) tags.push('缺货');

  // 型号编码（苹果4位数字，如3715）
  const modelMatch = name.match(/\((\d{4})\)/);
  if (modelMatch) model = modelMatch[1];

  // SKU 编码（如 T74/TQ4）
  const skuMatch = name.match(/\(([A-Z0-9]{3,4}\/[A-Z0-9]{3,4})\)/);
  if (skuMatch) sku = skuMatch[1];

  // 容量
  let storageMatch = name.match(/\+\s*(\d+(?:GB|G|TB|T))\b/i);
  if (!storageMatch) storageMatch = name.match(/[-\s](\d+(?:GB|G|TB|T))\b/i);
  if (storageMatch) {
    storage = storageMatch[1].toUpperCase();
    if (storage === 'G') storage = 'GB';
    if (storage === 'T') storage = 'TB';
  }

  // 颜色（扩展常见颜色）
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
    '星际蓝', '跃影红', '活力橙', '橄榄金', '深空灰', '钛黑色', '钛原色',
    '原野绿', '冰川白', '冰川黑', '雅川青', '晴川蓝', '海湖青', '墨玉青', '松烟墨',
    '泰山日出', '霓虹紫', '燃橙', '镭射灰', '赤焰红', '远山黛', '云水蓝', '白玉青',
    '托特蓝', '玄武黑', '赤霞橙', '月光白', '雾川蓝', '薄荷青', '晨曦白', '暗夜绿',
    '简艾灰', '简青', '荧彩色', '镜瓷白', '彩银色', '雾岛青', '夏日蓝', '海盐蓝'
  ];
  for (const c of colors) {
    if (name.includes(c)) { color = c; break; }
  }

  // 清理名称
  const cleanName = name
    .replace(/\*+$/, '')
    .replace(/\(官网\)/g, '')
    .replace(/\(兰州激活\)/g, '')
    .replace(/\(仅激活\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    id: `${brand}-${p.productId}`,
    sourceId: p.productId,
    shopId: p.shopId,
    brand,
    category,
    name: cleanName,
    model,
    sku,
    color,
    storage,
    channel,
    price: p.price,
    tags
  };
}

// 请求单个分类页
async function fetchCategory(jar, km) {
  const url = QUOTE_URL + '?pp=&km=' + encodeURIComponent(km) + '&network=&tykhgsdm=&cksxname=';
  const res = await fetchWithCookies(url, jar);
  return await res.text();
}

// ===== 登录（OCR 识别图形验证码，自动重试）=====
async function loginMember(solver) {
  for (let attempt = 1; attempt <= LOGIN_MAX_RETRY; attempt++) {
    const jar = new CookieJar();
    // 1. 登录页建立 session
    const r0 = await fetchWithCookies(LOGIN_URL, jar);
    await r0.text();
    // 2. 取验证码（同 session）
    const rc = await fetchWithCookies(BASE_URL + '/image.jsp?t=' + Math.random(), jar);
    const capBuf = Buffer.from(await rc.arrayBuffer());
    const sign = await solver.solve(capBuf);
    if (!/^\d{4}$/.test(sign)) {
      console.log(`  登录第 ${attempt} 次：验证码识别为"${sign}"，刷新重试`);
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    // 3. 提交登录（jiqima 安全控件非必填，密码明文）
    const form = new URLSearchParams({
      pwd: BF_PASS, dhhm: BF_USER, sign,
      autoDhhm: '', autoPass: '', autoLoginCheck: '0',
      autoLoginFlag: 'N', autoTime: '', jiqima: ''
    });
    const r = await fetch(BASE_URL + '/dologin.action?bjdflag=', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': jar.toString(),
        'Referer': LOGIN_URL
      },
      body: form.toString()
    });
    jar.setFromHeaders(r.headers);
    const txt = await r.text();
    let j = {};
    try { j = JSON.parse(txt); } catch { /* 非 JSON 视为失败 */ }
    if (j.code === 0 || j.code === 200) {
      console.log(`  登录成功（第 ${attempt} 次，验证码 ${sign}）`);
      return jar;
    }
    console.log(`  登录第 ${attempt} 次失败：${txt.slice(0, 80)}（验证码 ${sign}）`);
    await new Promise(r => setTimeout(r, 600));
  }
  throw new Error('登录失败：超过最大重试次数（' + LOGIN_MAX_RETRY + '）');
}

// 登录后遍历全分类，返回 Map<sourceId, 会员价>
async function crawlMemberPrices(jar) {
  const prices = new Map();
  function ingest(html) {
    const sections = extractSections(html);
    const raw = extractProducts(html, sections);
    for (const p of raw) {
      if (!prices.has(p.productId)) prices.set(p.productId, p.price);
    }
    return raw.length;
  }
  const homeRes = await fetchWithCookies(QUOTE_URL, jar);
  console.log(`  会员价首页: ${ingest(await homeRes.text())} 条`);
  for (const km of CATEGORIES) {
    try {
      const html = await fetchCategory(jar, km);
      const n = ingest(html);
      console.log(`  [会员价] ${km.padEnd(14)} ${String(n).padStart(3)} 条`);
    } catch (e) {
      console.log(`  [会员价] ${km.padEnd(14)} 失败: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, REQ_DELAY));
  }
  return prices;
}

async function main() {
  console.log('开始全分类爬取八方报价单...');
  const jar = new CookieJar();

  // 1. 首页建立会话
  console.log('建立会话...');
  const homeRes = await fetchWithCookies(QUOTE_URL, jar);
  const homeHtml = await homeRes.text();

  // 用 sourceId 去重的 Map
  const byId = new Map();

  function ingest(html, source) {
    const sections = extractSections(html);
    const raw = extractProducts(html, sections);
    let added = 0;
    for (const p of raw) {
      if (byId.has(p.productId)) continue;
      const brand = mapBrand(p.category, p.rawName);
      byId.set(p.productId, buildProduct(p, brand, p.category));
      added++;
    }
    return { total: raw.length, added, sections: sections.map(s => s.name) };
  }

  // 2. 首页默认
  const homeStat = ingest(homeHtml, '首页');
  console.log(`首页: 解析 ${homeStat.total}，新增 ${homeStat.added}，分区 [${homeStat.sections.join(',')}]`);

  // 3. 遍历所有二级分类
  for (const km of CATEGORIES) {
    try {
      const html = await fetchCategory(jar, km);
      const st = ingest(html, km);
      console.log(`  ${km.padEnd(14)} 解析 ${String(st.total).padStart(3)} 新增 ${String(st.added).padStart(3)} [${st.sections.join('/')}]`);
    } catch (e) {
      console.log(`  ${km.padEnd(14)} 失败: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, REQ_DELAY));
  }

  const products = [...byId.values()];
  console.log(`\n[公开价]去重后总产品数: ${products.length}`);

  // ===== 登录抓取会员价（真实拿货成本基准）=====
  if (!BF_USER || !BF_PASS) {
    throw new Error('缺少八方登录凭证：请在环境变量设置 BF_USER / BF_PASS（GitHub Actions 中配置为同名 Secrets）');
  }
  console.log('\n开始登录抓取会员价（八方会员）...');
  const solver = new CaptchaSolver();
  await solver.init();
  let memberPrices = new Map();
  try {
    const memberJar = await loginMember(solver);
    memberPrices = await crawlMemberPrices(memberJar);
  } finally {
    await solver.close();
  }
  console.log(`[会员价]去重后总条数: ${memberPrices.size}`);

  // 合并：按 sourceId 挂 memberPrice（会员价 <100 视为缺货置 null，定价回退）
  let withMember = 0;
  for (const p of products) {
    const mp = memberPrices.get(p.sourceId);
    if (mp !== undefined && mp >= 100) { p.memberPrice = mp; withMember++; }
    else p.memberPrice = null;
  }
  console.log(`成功对齐会员价的产品: ${withMember}/${products.length}`);

  // 品牌/分区统计
  const byBrand = {}, byCat = {};
  products.forEach(p => {
    byBrand[p.brand] = (byBrand[p.brand] || 0) + 1;
    byCat[p.category] = (byCat[p.category] || 0) + 1;
  });
  console.log('\n品牌统计:');
  Object.entries(byBrand).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('\n分区统计:');
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  const validPrices = products.filter(p => p.price >= 100).map(p => p.price);
  if (validPrices.length) {
    console.log(`\n有效价格区间: ￥${Math.min(...validPrices)} ~ ￥${Math.max(...validPrices)}`);
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const updateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const output = {
    updateTime,
    memberPriceTime: updateTime,
    source: QUOTE_URL,
    count: products.length,
    memberCount: withMember,
    products
  };
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n已写入 data.json（${products.length} 个产品，其中 ${withMember} 个含真实会员价）`);
}

main().catch(err => {
  console.error('爬取失败:', err.message);
  process.exit(1);
});
