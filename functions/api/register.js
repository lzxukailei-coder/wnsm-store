import { json, readBody, validPhone } from '../_lib/respond.js';
import { hashPassword, randomHex, createSession, publicUser } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  let phone = (b.phone || '').trim();
  const password = b.password || '';
  let role = b.role === 'business' || b.role === 'B' ? 'B' : 'C';
  const company = (b.company || '').trim();
  const contact = (b.contact || '').trim();
  const businessLicense = (b.businessLicense || '').trim();

  if (!validPhone(phone)) return json({ ok: false, error: '请输入正确的 11 位手机号' }, 400);
  if (password.length < 6 || password.length > 32) return json({ ok: false, error: '密码长度需为 6-32 位' }, 400);
  if (role === 'B' && !company) return json({ ok: false, error: '同行注册需填写公司/门店名称' }, 400);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first();
  if (exists) return json({ ok: false, error: '该手机号已注册，请直接登录' }, 409);

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const status = role === 'B' ? 'pending' : 'approved';
  const createdAt = new Date().toISOString();

  const ins = await env.DB.prepare(
    `INSERT INTO users (phone, password_hash, salt, role, status, company, contact, business_license, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(phone, passwordHash, salt, role, status, company || null, contact || null, businessLicense || null, createdAt).run();

  const userId = ins.meta.last_row_id;
  const { cookie } = await createSession(env, userId);
  const user = { id: userId, phone, role, status, company, contact, business_license: businessLicense };

  return json({
    ok: true,
    user: publicUser(user),
    message: role === 'B' ? '注册成功，同行资质正在审核中，审核通过后显示批发价' : '注册成功'
  }, 200, { 'Set-Cookie': cookie });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
