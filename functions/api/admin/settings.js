import { json, readBody } from '../../_lib/respond.js';
import { getUser } from '../../_lib/auth.js';
import { invalidatePricing } from '../../_lib/catalog.js';

// 读取全局设置
export async function onRequestGet({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);
  const st = await env.DB.prepare('SELECT key, value FROM settings').all();
  const o = {};
  (st.results || []).forEach(r => { o[r.key] = Number(r.value); });
  return json({
    ok: true,
    bMargin: Number.isFinite(o.b_margin) ? o.b_margin : 50
  });
}

// 保存 B 端每台最低毛利
export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);
  const b = await readBody(request);
  const m = Number(b.bMargin);
  if (!Number.isFinite(m) || m < 0 || m > 2000) {
    return json({ ok: false, error: '每台毛利需为 0-2000 之间的数字' }, 400);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('b_margin', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(String(m), now).run();
  invalidatePricing();
  return json({ ok: true, bMargin: m });
}
