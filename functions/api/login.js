import { json, readBody, validPhone } from '../_lib/respond.js';
import { hashPassword, createSession, publicUser } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const phone = (b.phone || '').trim();
  const password = b.password || '';

  if (!validPhone(phone) || !password) return json({ ok: false, error: '请输入手机号和密码' }, 400);

  const u = await env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first();
  if (!u) return json({ ok: false, error: '手机号或密码错误' }, 401);

  const check = await hashPassword(password, u.salt);
  if (check !== u.password_hash) return json({ ok: false, error: '手机号或密码错误' }, 401);

  if (u.status === 'rejected') {
    return json({ ok: false, error: '账号审核未通过：' + (u.reject_reason || '请联系管理员') }, 403);
  }

  const { cookie } = await createSession(env, u.id);
  return json({ ok: true, user: publicUser(u) }, 200, { 'Set-Cookie': cookie });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
