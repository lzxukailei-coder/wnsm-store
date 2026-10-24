import { json, readBody, numOrNull } from '../../../_lib/respond.js';
import { getUser } from '../../../_lib/auth.js';
import { invalidatePricing } from '../../../_lib/catalog.js';

function validType(t) { return ['id', 'model', 'name'].includes(t); }

const UPSERT_SQL = `
  INSERT INTO price_overrides (match_type, match_value, cost, floor, fixed, note, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(match_type, match_value) DO UPDATE SET
    cost = excluded.cost, floor = excluded.floor, fixed = excluded.fixed,
    note = excluded.note, updated_at = excluded.updated_at
`;

// 列表（含全局设置）
export async function onRequestGet({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);
  const [ov, st] = await Promise.all([
    env.DB.prepare('SELECT * FROM price_overrides ORDER BY id DESC').all(),
    env.DB.prepare('SELECT key, value FROM settings').all()
  ]);
  const settings = {};
  (st.results || []).forEach(r => { settings[r.key] = Number(r.value); });
  return json({
    ok: true,
    overrides: ov.results || [],
    bMargin: Number.isFinite(settings.b_margin) ? settings.b_margin : 50
  });
}

// 单条新增/更新（按 match_type + match_value 唯一）
export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);
  const b = await readBody(request);
  const match_type = b.match_type || 'name';
  const match_value = (b.match_value || '').trim();
  if (!validType(match_type)) return json({ ok: false, error: '匹配类型无效' }, 400);
  if (!match_value) return json({ ok: false, error: '匹配值不能为空' }, 400);
  const cost = numOrNull(b.cost);
  const floor = numOrNull(b.floor);
  const fixed = numOrNull(b.fixed);
  const note = (b.note || '').trim();
  if (cost === null && floor === null && fixed === null) {
    return json({ ok: false, error: '成本价 / 硬底价 / 固定价 至少填一个' }, 400);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(UPSERT_SQL).bind(match_type, match_value, cost, floor, fixed, note, now, now).run();
  invalidatePricing();
  return json({ ok: true });
}

// 删除 ?id=
export async function onRequestDelete({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10);
  if (!id) return json({ ok: false, error: '缺少 id' }, 400);
  await env.DB.prepare('DELETE FROM price_overrides WHERE id = ?').bind(id).run();
  invalidatePricing();
  return json({ ok: true });
}
