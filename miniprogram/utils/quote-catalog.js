const { request, getToken } = require('./api');
const { quoteModel, quoteChannel, searchTerms, matchesQuote, sortQuotes, modelQuotes } = require('./quote-model');
const { PRICE_LABEL } = require('./catalog');

const PAGE_SIZE = 20;
const LEGACY_TTL = 60000;
let publicSnapshot;

function queryString(parameters) {
  return Object.keys(parameters)
    .filter(key => parameters[key] !== undefined && parameters[key] !== '')
    .map(key => key + '=' + encodeURIComponent(parameters[key]))
    .join('&');
}

function projectLegacy(data, parameters) {
  if (parameters.view === 'model') {
    const products = modelQuotes(data.products, parameters.key);
    if (!products.length) throw new Error('这个机型暂时没有报价');
    return {
      products,
      updateTime: data.updateTime,
      auth: data.auth,
      modelName: quoteModel(products[0]).title
    };
  }
  const page = parameters.page || 1;
  const pageSize = parameters.pageSize || PAGE_SIZE;
  const filters = { terms: searchTerms(parameters.q), brand: parameters.brand || 'all', type: parameters.type || 'all' };
  const matching = sortQuotes(data.products).filter(product => matchesQuote(product, filters));
  const offset = (page - 1) * pageSize;
  return {
    products: matching.slice(offset, offset + pageSize),
    updateTime: data.updateTime,
    auth: data.auth,
    pagination: { page, total: matching.length, hasMore: offset + pageSize < matching.length }
  };
}

async function requestQuotes(parameters, { refresh = false } = {}) {
  const anonymous = !getToken();
  if (!refresh && anonymous && publicSnapshot && publicSnapshot.expires > Date.now()) {
    return projectLegacy(publicSnapshot.data, parameters);
  }
  const data = await request('/api/products?' + queryString(parameters));
  if (data.pagination || data.modelName) {
    publicSnapshot = null;
    return data;
  }
  if (!Array.isArray(data.products)) throw new Error('暂时无法读取报价，请稍后重试');
  // 过渡期间兼容旧接口，只暂存无身份的公开报价。
  if (anonymous && !data.auth) publicSnapshot = { data, expires: Date.now() + LEGACY_TTL };
  return projectLegacy(data, parameters);
}

function decorateQuote(product) {
  const label = PRICE_LABEL[product.priceLabel] || PRICE_LABEL.public;
  const model = quoteModel(product);
  return Object.assign({}, product, {
    modelKey: product.modelKey || model.key,
    modelName: product.modelName || model.title,
    storageLabel: model.ram ? model.ram + 'GB+' + model.storage : model.storage,
    color: model.color,
    channelLabel: quoteChannel(product),
    labelText: label.text,
    labelCls: label.cls,
    priceText: product.outStock ? '缺货 / 待报价' : (product.displayPrice != null ? '¥ ' + product.displayPrice : '—')
  });
}

function beijingQuoteTime(value) {
  if (!value) return '';
  const utc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + ':00Z'
    : value;
  const timestamp = Date.parse(utc);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function quotePath(key, id) {
  if (!key) return '/pages/index/index';
  return '/pages/quote/quote?' + queryString({ key, id });
}

module.exports = { PAGE_SIZE, requestQuotes, decorateQuote, beijingQuoteTime, quotePath };
