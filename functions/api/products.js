import { json } from '../_lib/respond.js';
import { getUser, publicUser } from '../_lib/auth.js';
import { loadCatalog, loadPricing, toPublicProduct } from '../_lib/catalog.js';

// 商品列表：按当前登录身份返回对应展示价（含 SKU 底价保护），原始价/成本永不下发
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  const [data, pricing] = await Promise.all([
    loadCatalog(request, env),
    loadPricing(env)
  ]);
  const products = (data.products || []).map(p => toPublicProduct(p, user, pricing));
  return json({
    ok: true,
    updateTime: data.updateTime || '',
    count: products.length,
    auth: user ? publicUser(user) : null,
    products
  });
}
