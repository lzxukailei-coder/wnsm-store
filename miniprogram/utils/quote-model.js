const CAPACITY = /(^|[^\d])((?:\d{1,2}\s*(?:(?:GB|G)\s*)?[+＋]\s*)?((?:32|64|128|256|512|1024|2048)\s*(?:GB|G)|(?:1|2|4)\s*TB))(?![a-z0-9])/i;

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// 有容量标记时，容量之前的名称用于分组，保留 Pro、Max 等机型差异。
function quoteModel(product) {
  const name = String(product.name || product.model || '未知机型').trim();
  const match = CAPACITY.exec(name);
  const end = match ? match.index + match[1].length : name.length;
  const title = name.slice(0, end).replace(/[\s\-—_·（(]+$/, '') || name;
  const capacity = match ? match[3].toUpperCase().replace(/\s+/g, '').replace(/G$/, 'GB') : '';
  return {
    title,
    key: normalize(product.brand || 'other') + '|' + normalize(title),
    storage: product.storage || capacity
  };
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
  const fields = [product.name, product.model, product.category, product.storage, product.color, product.channel, tags];
  const searchable = fields.map(normalize).join(' ');
  return terms.every(term => searchable.includes(term));
}

module.exports = { quoteModel, quoteChannel, searchTerms, matchesQuote };
