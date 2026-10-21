import { json } from '../_lib/respond.js';
import { getUser, publicUser } from '../_lib/auth.js';
import { loadCatalog, toPublicProduct } from '../_lib/catalog.js';

// 商品列表：按当前登录身份返回对应展示价，原始八方公开价/成本价永不下发
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  const data = await loadCatalog(request, env);
  const products = (data.products || []).map(p => toPublicProduct(p, user));
  return json({
    ok: true,
    updateTime: data.updateTime || '',
    count: products.length,
    auth: user ? publicUser(user) : null,
    products
  });
}
