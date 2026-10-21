import { json, readBody } from '../../_lib/respond.js';
import { getUser } from '../../_lib/auth.js';

// 管理员：审核通过 / 驳回 B 端同行
export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);

  const b = await readBody(request);
  const id = parseInt(b.id, 10);
  if (!id) return json({ ok: false, error: '缺少用户 id' }, 400);

  if (b.action === 'approve') {
    await env.DB.prepare(
      "UPDATE users SET status = 'approved', reject_reason = NULL WHERE id = ? AND role = 'B'"
    ).bind(id).run();
    return json({ ok: true });
  }

  if (b.action === 'reject') {
    const reason = (b.reason || '').trim() || '资质不符';
    await env.DB.prepare(
      "UPDATE users SET status = 'rejected', reject_reason = ? WHERE id = ? AND role = 'B'"
    ).bind(reason, id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: '未知操作' }, 400);
}
