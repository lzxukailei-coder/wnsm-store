const LEGACY_CAPACITY = /(^|[^\d])((?:\d{1,2}\s*(?:(?:GB|G)\s*)?[+＋]\s*)?((?:32|64|128|256|512|1024|2048)\s*(?:GB|G)|(?:1|2|4)\s*TB))(?![a-z0-9])/i;
const CAPACITY = /(^|[^\d])(?:(\d{1,2})\s*(?:GB?\s*)?\+\s*)?((?:32|64|128|256|512|1024|2048)\s*GB?|[1248]\s*TB?)(?=4G|5G|Wi-?Fi|[^a-z0-9]|$)/i;
const BARE_CAPACITY = /(^|[^\d])(\d{1,2})\s*(?:GB?\s*)?\+\s*(32|64|128|256|512|1024|2048)(?=4G|5G|Wi-?Fi|[^a-z0-9]|$)/i;
const UNKNOWN_SIZE = Number.MAX_SAFE_INTEGER;
const collator = typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
  ? new Intl.Collator('zh-CN', { numeric: true }) : null;
const sortedSnapshots = new WeakMap();
const parsedModels = new WeakMap();

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function productName(product) {
  return String(product.name || product.model || '未知机型').trim();
}

function modelIdentity(product, name, match) {
  const end = match ? match.index + match[1].length : name.length;
  const title = name.slice(0, end).replace(/[\s\-—_·（(]+$/, '') || name;
  return { title, key: normalize(product.brand || 'other') + '|' + normalize(title) };
}

function storageLabel(value) {
  const match = /^(\d+(?:\.\d+)?)\s*([gt]b?)?$/i.exec(String(value || '').trim().normalize('NFKC'));
  if (!match) return '';
  return match[1] + (/^t/i.test(match[2] || '') ? 'TB' : 'GB');
}

function quoteColor(product, suffix) {
  const color = String(product.color || '').trim();
  if (color && color !== '*') return color;
  // 旧报价的颜色可能只出现在容量后面，例如「512GB5G原封型格紫」。
  const details = suffix.replace(/\([^)]*\)|【[^】]*】/g, ' ')
    .replace(/(?:4G|5G|Wi-?Fi)(?:版)?|兰州激活|仅激活|原封|国补|官网|不换机|全新机/gi, ' ');
  const match = /(?:^|[^一-龥])([一-龥]{0,5}[黑白银金蓝绿紫红粉灰青橙黄棕褐]色?)(?=$|[^一-龥])/.exec(details);
  return match ? match[1] : '';
}

// 用名称中的完整规格补足旧目录的空字段或误识别的容量。
function quoteModel(product) {
  const cached = parsedModels.get(product);
  if (cached) return cached;
  const name = productName(product).normalize('NFKC');
  const explicit = CAPACITY.exec(name);
  const bare = BARE_CAPACITY.exec(name);
  const match = bare && (!explicit || bare.index < explicit.index) ? bare : explicit;
  const model = {
    ...modelIdentity(product, name, match),
    storage: storageLabel(match ? match[3] : product.storage),
    ram: match && match[2] ? Number(match[2]) : 0,
    color: quoteColor(product, match ? name.slice(match.index + match[0].length) : '')
  };
  parsedModels.set(product, model);
  return model;
}

function compareKey(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareText(left, right) {
  if (left === right) return 0;
  if (collator) return collator.compare(left, right);
  const numericKey = value => value.replace(/\d+/g, digits => digits.padStart(12, '0'));
  return compareKey(numericKey(left), numericKey(right));
}

function sortQuotes(products) {
  if (sortedSnapshots.has(products)) return sortedSnapshots.get(products);
  const rows = products.map(product => {
    const model = quoteModel(product);
    return {
      product, title: normalize(model.title), key: model.key, color: normalize(model.color),
      storage: model.storage ? parseFloat(model.storage) * (model.storage.endsWith('TB') ? 1024 : 1) : UNKNOWN_SIZE,
      ram: model.ram || UNKNOWN_SIZE,
      id: String(product.id || '')
    };
  });
  rows.sort((left, right) => compareText(left.title, right.title)
    || compareKey(left.key, right.key)
    || left.storage - right.storage
    || left.ram - right.ram
    || Number(!left.color) - Number(!right.color)
    || compareText(left.color, right.color)
    || compareKey(left.id, right.id));
  const ordered = rows.map(row => row.product);
  sortedSnapshots.set(products, ordered);
  return ordered;
}

function modelQuotes(products, key) {
  const matches = products.filter(product => quoteModel(product).key === key);
  if (matches.length) return sortQuotes(matches);

  // 支持按旧版机型名称生成的分享链接。
  const previous = products.find(product => {
    const name = productName(product);
    return modelIdentity(product, name, LEGACY_CAPACITY.exec(name)).key === key;
  });
  if (!previous) return [];
  const currentKey = quoteModel(previous).key;
  return sortQuotes(products.filter(product => quoteModel(product).key === currentKey));
}

function quoteChannel(product) {
  const channel = String(product.channel || '').trim();
  if (channel && channel !== '*') return channel;
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : '';
  const match = /兰州激活|仅激活|国补|原封|官网/.exec(tags + ' ' + (product.name || ''));
  return match ? match[0] : '';
}

function searchTerms(keyword) {
  return String(keyword || '').trim().split(/\s+/).map(normalize).filter(Boolean);
}

function matchesQuote(product, { terms, brand, type }, productType = product.ptype) {
  if (brand !== 'all' && normalize(product.brand || 'other') !== brand) return false;
  if (type !== 'all' && productType !== type) return false;
  if (terms.length === 0) return true;
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : '';
  const model = quoteModel(product);
  const memory = model.ram ? model.ram + 'GB+' + model.storage : model.storage;
  const fields = [product.name, product.model, product.category, product.storage, memory, model.color, product.channel, tags];
  const searchable = fields.map(normalize).join(' ');
  return terms.every(term => searchable.includes(term));
}

module.exports = { quoteModel, quoteChannel, searchTerms, matchesQuote, sortQuotes, modelQuotes };
