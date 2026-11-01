// 绑定当前登录账号与微信 openid/unionid：手机号登录成功后由前端调用，完成多端身份打通
import { json, readBody } from '../_lib/respond.js';
import { getUser } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ ok: false, error: '请先登录' }, 401);
  const b = await readBody(request);
  const source = b.source === 'official' ? 'official' : 'miniprogram';
  const openid = (b.openid || '').trim();
  if (!openid) return json({ ok: false, error: '缺少 openid' }, 400);

  // 该 openid 已绑别的账号则拒绝，避免串号
  const conflict = await env.DB.prepare(
    'SELECT user_id FROM external_identities WHERE source = ? AND openid = ?'
  ).bind(source, openid).first();
  if (conflict && conflict.user_id !== me.id) {
    return json({ ok: false, error: '该微信已绑定其他账号' }, 409);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO external_identities (user_id, source, openid, unionid, nickname, avatar, channel, bound_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, openid) DO UPDATE SET user_id = excluded.user_id, unionid = excluded.unionid, last_seen_at = excluded.last_seen_at`
  ).bind(me.id, source, openid, b.unionid || null, b.nickname || null, b.avatar || null, b.channel || null, now, now).run();

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
