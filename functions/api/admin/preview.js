import { json } from '../../_lib/respond.js';
import { getUser } from '../../_lib/auth.js';
import { loadCatalog, loadPricing, computePrices, isOutOfStock } from '../../_lib/catalog.js';

// 管理员：按型号/名称关键词预览定价构成（含公开价、会员价、成本、底价、B/C 售价）
export async function onRequestGet({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);

  const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
  const [data, pricing] = await Promise.all([loadCatalog(request, env), loadPricing(env)]);
  let list = data.products || [];
  if (q) {
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.model || '').toLowerCase().includes(q));
  }
  const total = list.length;
  list = list.slice(0, 50);

  const items = list.map(p => {
    const outStock = isOutOfStock(p);
    const c = computePrices(p, pricing);
    return {
      id: p.id,
      name: p.name,
      model: p.model || '',
      outStock,
      base: c.base,
      member: c.member,
      retail: outStock ? null : c.retail,
      wholesale: outStock ? null : c.wholesale,
      override: c.override ? {
        match_type: c.override.match_type,
        match_value: c.override.match_value,
        cost: c.override.cost,
        floor: c.override.floor,
        fixed: c.override.fixed,
        note: c.override.note
      } : null
    };
  });
  return json({ ok: true, bMargin: pricing.bMargin, total, items });
}
