import { json } from '../_lib/respond.js';
import { getUser, publicUser } from '../_lib/auth.js';
import { getType, loadCatalog, loadPricing, toPublicProduct } from '../_lib/catalog.js';
import quoteModelHelpers from '../../miniprogram/utils/quote-model.js';

const { quoteModel, searchTerms, matchesQuote } = quoteModelHelpers;

function positiveInt(value, fallback, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

// 分页和详情复用身份定价，旧调用继续读取完整报价。
export async function onRequestGet({ request, env }) {
  const [user, data, pricing] = await Promise.all([
    getUser(request, env),
    loadCatalog(request, env),
    loadPricing(env)
  ]);
  const raw = data.products || [];
  const common = { ok: true, updateTime: data.updateTime || '', auth: user ? publicUser(user) : null };
  const query = new URL(request.url).searchParams;
  const view = query.get('view');
  const toQuote = product => {
    const model = quoteModel(product);
    return { ...toPublicProduct(product, user, pricing), modelKey: model.key, modelName: model.title };
  };

  if (view === 'model') {
    const key = query.get('key');
    if (!key || key.length > 250) return json({ ok: false, error: '机型链接不完整' }, 400);
    const variants = raw.filter(product => quoteModel(product).key === key);
    if (!variants.length) return json({ ok: false, error: '这个机型暂时没有报价' }, 404);
    const products = variants.map(toQuote);
    return json({ ...common, count: products.length, modelName: products[0].modelName, products });
  }

  if (view === 'catalog') {
    const page = positiveInt(query.get('page'), 1, 1000000);
    const pageSize = positiveInt(query.get('pageSize'), 20, 50);
    const filters = {
      terms: searchTerms((query.get('q') || '').slice(0, 80)),
      brand: (query.get('brand') || 'all').trim().toLowerCase(),
      type: (query.get('type') || 'all').trim().toLowerCase()
    };
    const matching = raw.filter(product => matchesQuote(product, filters, filters.type === 'all' ? '' : getType(product)));
    const offset = (page - 1) * pageSize;
    const products = matching.slice(offset, offset + pageSize).map(toQuote);
    return json({
      ...common,
      count: matching.length,
      pagination: { page, pageSize, total: matching.length, hasMore: offset + products.length < matching.length },
      products
    });
  }

  const products = raw.map(product => toPublicProduct(product, user, pricing));
  return json({ ...common, count: products.length, products });
}
