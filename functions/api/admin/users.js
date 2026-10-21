import { json } from '../../_lib/respond.js';
import { getUser } from '../../_lib/auth.js';

// 管理员：列出全部非管理员用户（待审核优先）
export async function onRequestGet({ request, env }) {
  const me = await getUser(request, env);
  if (!me || me.role !== 'admin') return json({ ok: false, error: '无权限' }, 403);

  const rows = await env.DB.prepare(
    `SELECT id, phone, role, status, company, contact, business_license, reject_reason, created_at
       FROM users
      WHERE role <> 'admin'
      ORDER BY (status = 'pending') DESC, id DESC`
  ).all();

  return json({ ok: true, users: rows.results || [] });
}
