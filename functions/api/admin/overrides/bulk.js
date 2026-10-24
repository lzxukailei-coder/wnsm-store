import { json, readBody, numOrNull } from '../../../_lib/respond.js';
import { getUser } from '../../../_lib/auth.js';
import { invalidatePricing } from '../../../_lib/catalog.js';

function mapType(t) {
  t = (t || '').trim().toLowerCase();
  if (['id', '编号', '产品id', '产品ID'].includes(t)) return 'id';
  if (['model', '型号', '机型'].includes(t)) return 'model';
  if (['name', '名称', '关键词', '名称包含'].includes(t)) return 'name';
  return null;
}

const UPSERT_SQL = `
  INSERT INTO price_overrides (match_type, match_value, cost, floor, fixed, note, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(match_type, match_value) DO UPDATE SET
    cost = excluded.cost, floor = excluded.floor, fixed = excluded.fixed,
    note = excluded.note, updated_at = excluded.updated_at
`;

// 批量导入：CSV 文本，每行 “类型,匹配值,成本,硬底价,固定价,备注”（成本/底价/固定价可留空，至少一个）
export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);
  const b = await readBody(request);
  const lines = String(b.csv || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return json({ ok: false, error: '没有可导入的内容' }, 400);

  const now = new Date().toISOString();
  let imported = 0;
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const mt = mapType(cols[0]);
    if (!mt) {
      // 表头行静默跳过
      if (i === 0) continue;
      errors.push(`第${i + 1}行：类型“${cols[0]}”无效`);
      continue;
    }
    const mv = cols[1];
    if (!mv) { errors.push(`第${i + 1}行：匹配值为空`); continue; }
    const cost = numOrNull(cols[2]);
    const floor = numOrNull(cols[3]);
    const fixed = numOrNull(cols[4]);
    const note = cols.slice(5).join(',');
    if (cost === null && floor === null && fixed === null) {
      errors.push(`第${i + 1}行：${mv} 成本/硬底价/固定价至少填一个`);
      continue;
    }
    await env.DB.prepare(UPSERT_SQL).bind(mt, mv, cost, floor, fixed, note, now, now).run();
    imported++;
  }
  invalidatePricing();
  return json({ ok: true, imported, errors });
}
