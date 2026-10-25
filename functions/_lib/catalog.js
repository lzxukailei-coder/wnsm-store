// 商品目录读取、SKU 底价保护与价格分级（全部在服务端计算，原始成本价永不下发）

let catalogCache = { data: null, time: 0 };
let pricingCache = { data: null, time: 0 };
const CATALOG_TTL = 5 * 60 * 1000;   // 目录 5 分钟
const PRICING_TTL = 60 * 1000;       // 底价规则/设置 60 秒（改价后最多 1 分钟生效）

const DEFAULT_B_MARGIN = 50;         // B 端默认每台最低毛利（八方真实会员价 +50）
const C_MIN_MARGIN = 100;            // C 端零售价至少高于拿货成本 100

// 通过 env.ASSETS 读取受保护的静态 data.json（ASSETS 不走 Functions 路由，可读到被拦截的文件）
export async function loadCatalog(request, env) {
  if (catalogCache.data && Date.now() - catalogCache.time < CATALOG_TTL) return catalogCache.data;
  const url = new URL('/data.json', request.url);
  const res = await env.ASSETS.fetch(new Request(url.toString(), {
    headers: { 'Cache-Control': 'no-cache' }
  }));
  if (!res.ok) throw new Error('catalog load failed: ' + res.status);
  const data = await res.json();
  catalogCache.data = data;
  catalogCache.time = Date.now();
  return data;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 加载底价规则与全局设置，建立内存索引（id / model 精确，name 关键词）
export async function loadPricing(env) {
  if (pricingCache.data && Date.now() - pricingCache.time < PRICING_TTL) return pricingCache.data;
  const [ovRes, setRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM price_overrides ORDER BY id DESC').all(),
    env.DB.prepare('SELECT key, value FROM settings').all()
  ]);
  const idMap = {}, modelMap = {}, nameRules = [];
  (ovRes.results || []).forEach(r => {
    const rule = {
      id: r.id,
      match_type: r.match_type,
      match_value: r.match_value,
      cost: num(r.cost),
      floor: num(r.floor),
      fixed: num(r.fixed),
      note: r.note || ''
    };
    if (r.match_type === 'id') idMap[r.match_value] = rule;
    else if (r.match_type === 'model') modelMap[r.match_value] = rule;
    else nameRules.push(rule);
  });
  const settings = {};
  (setRes.results || []).forEach(s => { settings[s.key] = s.value; });
  const bMargin = num(settings.b_margin);
  const data = {
    bMargin: bMargin !== null ? bMargin : DEFAULT_B_MARGIN,
    idMap, modelMap, nameRules
  };
  pricingCache.data = data;
  pricingCache.time = Date.now();
  return data;
}

// 管理端写操作后调用：清本实例规则缓存（其余实例最多 60 秒后自然过期）
export function invalidatePricing() { pricingCache.data = null; }

// 匹配优先级：id 精确 > model 型号精确 > name 名称包含
export function findOverride(p, pricing) {
  if (p.id && pricing.idMap[p.id]) return pricing.idMap[p.id];
  if (p.model && pricing.modelMap[p.model]) return pricing.modelMap[p.model];
  for (const r of pricing.nameRules) {
    if (r.match_value && p.name && p.name.includes(r.match_value)) return r;
  }
  return null;
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

export function isOutOfStock(p) {
  return (p.tags || []).includes('缺货') || p.price < 100;
}

// 核心定价：计算 B/C 两个价格，并应用 SKU 底价保护
export function computePrices(p, pricing) {
  const base = p.price;
  // 八方登录后真实会员价（每日随爬虫抓取，即默认拿货成本基准）；缺失时回退 公开价-80
  const member = (p.memberPrice && p.memberPrice >= 100) ? p.memberPrice : base - 80;
  const ov = findOverride(p, pricing);
  const cost = ov ? ov.cost : null;
  const floor = ov ? ov.floor : null;
  const fixed = ov ? ov.fixed : null;

  // B 端批发价：固定价优先；否则不得低于 真实会员价+毛利/成本+毛利/硬底价
  let wholesale;
  if (fixed !== null) {
    wholesale = fixed;
  } else {
    let w = member + pricing.bMargin;
    if (cost !== null) w = Math.max(w, cost + pricing.bMargin);
    if (floor !== null) w = Math.max(w, floor);
    wholesale = Math.round(w);
  }

  // C 端零售价：阶梯加价；同时不得低于真实拿货价/手工成本 + 最低零售毛利
  let retail = retailPrice(base);
  retail = Math.max(retail, Math.round(member + C_MIN_MARGIN));
  if (cost !== null) retail = Math.max(retail, Math.round(cost + C_MIN_MARGIN));

  return {
    wholesale,
    retail,
    member: Math.round(member),
    base: Math.round(base),
    override: ov
  };
}

// 按身份把原始产品映射为对外产品（剔除原始价，仅给展示价；不暴露成本/规则）
export function toPublicProduct(p, user, pricing) {
  const outStock = isOutOfStock(p);
  let displayPrice = null;
  let priceLabel = null; // retail=零售价 wholesale=批发价 pending=B端审核中(暂看零售)
  if (!outStock) {
    const c = computePrices(p, pricing);
    if (user && user.role === 'B' && user.status === 'approved') {
      displayPrice = c.wholesale;
      priceLabel = 'wholesale';
    } else if (user) {
      displayPrice = c.retail;
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
