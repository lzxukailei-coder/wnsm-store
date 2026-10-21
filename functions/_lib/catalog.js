// 商品目录读取与价格分级（全部在服务端计算，原始成本价永不下发）

let cache = { data: null, time: 0 };
const TTL = 5 * 60 * 1000;

// 通过 env.ASSETS 读取受保护的静态 data.json（ASSETS 不走 Functions 路由，可读到被拦截的文件）
export async function loadCatalog(request, env) {
  if (cache.data && Date.now() - cache.time < TTL) return cache.data;
  const url = new URL('/data.json', request.url);
  const res = await env.ASSETS.fetch(new Request(url.toString(), {
    headers: { 'Cache-Control': 'no-cache' }
  }));
  if (!res.ok) throw new Error('catalog load failed: ' + res.status);
  const data = await res.json();
  cache.data = data;
  cache.time = Date.now();
  return data;
}

// 品类推断（与历史前端一致）
export function getType(p) {
  const c = p.category || '', n = p.name || '';
  if (c.includes('平板')) return 'tablet';
  if (c.includes('手表')) return 'watch';
  if (c.includes('耳机')) return 'audio';
  if (c.includes('配件')) return 'accessory';
  if (/平板|iPad|IPAD|MatePad|妙控键盘/.test(n)) return 'tablet';
  if (/手表|Watch|WATCH|眼镜|手环|WhizKid/.test(n)) return 'watch';
  if (/耳机|AirPods|AIRPODS|音响|音箱|蓝牙/.test(n)) return 'audio';
  if (/笔记本|MacBook|电脑主机|mini主机|一体机|主机/.test(n)) return 'computer';
  if (/充电器|键盘|鼠标|手写笔|Pencil|触控笔|转接线|数据线|电源适配器|快充|打印机|电脑包|保护壳|贴膜|线控|充电头/.test(n)) return 'accessory';
  if (['苹果', '华为', '华为ND', '华为全国', '小米', '荣耀', 'VIVO', 'OPPO', '三星', '摩托罗拉', '诺基亚', '百合'].includes(c)) return 'phone';
  return 'smart';
}

// 零售价：在八方公开价基础上阶梯加价
const RETAIL_MARKUP = [
  { min: 0, max: 2000, add: 200 },
  { min: 2000, max: 5000, add: 300 },
  { min: 5000, max: 10000, add: 500 },
  { min: 10000, max: Infinity, add: 800 }
];
export function retailPrice(base) {
  const r = RETAIL_MARKUP.find(x => base >= x.min && base < x.max);
  return base + (r ? r.add : 500);
}
// 批发价：八方会员价(公开价-80) 基础上自留 50 → 公开价 - 30
export function wholesalePrice(base) {
  return base - 30;
}

export function isOutOfStock(p) {
  return (p.tags || []).includes('缺货') || p.price < 100;
}

// 按身份把原始产品映射为对外产品（剔除原始价，仅给展示价）
export function toPublicProduct(p, user) {
  const outStock = isOutOfStock(p);
  let displayPrice = null;
  let priceLabel = null; // retail=零售价 wholesale=批发价 pending=B端审核中(暂看零售)
  if (!outStock) {
    if (user && user.role === 'B' && user.status === 'approved') {
      displayPrice = wholesalePrice(p.price);
      priceLabel = 'wholesale';
    } else if (user) {
      displayPrice = retailPrice(p.price);
      priceLabel = (user.role === 'B' && user.status === 'pending') ? 'pending' : 'retail';
    }
    // 未登录：displayPrice/priceLabel 均为 null，前端引导登录
  }
  return {
    id: p.id,
    brand: p.brand,
    category: p.category,
    name: p.name,
    model: p.model || '',
    sku: p.sku || '',
    color: p.color || '',
    storage: p.storage || '',
    channel: p.channel || '',
    tags: p.tags || [],
    ptype: getType(p),
    outStock,
    displayPrice,
    priceLabel
  };
}
