// 微信小程序 / 公众号登录：wx.login 拿到的 code 换 openid/unionid，再与现有手机号账号体系绑定
// 上线前置条件（在 Cloudflare 后台 Pages → Settings → Variables and Secrets 配置）：
//   WX_MP_APPID     小程序 AppID
//   WX_MP_SECRET    小程序 AppSecret
//   WX_OA_APPID     公众号 AppID（同主体并接入微信开放平台后可拿到同一 unionid）
//   WX_OA_SECRET    公众号 AppSecret
// 配置前调用本接口返回 503，前端回退到手机号 + 密码登录。

import { json, readBody } from '../_lib/respond.js';
import { createSession, publicUser, getUser } from '../_lib/auth.js';

const TTL = 30 * 86400 * 1000;

async function wxCode2Session(code, appid, secret) {
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.errcode) throw new Error(data.errmsg || '微信登录失败');
  return data; // { openid, unionid?, session_key }
}

async function wxOauthAccessToken(code, appid, secret) {
  // 公众号网页授权 code 换 access_token + openid（公众号与小程序绑定同一开放平台后返回同一 unionid）
  const url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${secret}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.errcode) throw new Error(data.errmsg || '公众号授权失败');
  return data; // { access_token, openid, unionid?, scope }
}

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const code = (b.code || '').trim();
  const source = b.source === 'official' ? 'official' : 'miniprogram';
  if (!code) return json({ ok: false, error: '缺少微信 code' }, 400);

  const appid = source === 'official' ? env.WX_OA_APPID : env.WX_MP_APPID;
  const secret = source === 'official' ? env.WX_OA_SECRET : env.WX_MP_SECRET;
  if (!appid || !secret) {
    return json({ ok: false, error: '微信登录尚未配置（后台补充 AppID/Secret 后生效），请先用手机号登录' }, 503);
  }

  let wx;
  try {
    wx = source === 'official'
      ? await wxOauthAccessToken(code, appid, secret)
      : await wxCode2Session(code, appid, secret);
  } catch (e) {
    return json({ ok: false, error: e.message || '微信接口异常' }, 502);
  }
  const { openid, unionid } = wx;
  if (!openid) return json({ ok: false, error: '未能获取微信身份' }, 502);

  // 1) 已绑定过该 openid 的账号直接登录
  const bound = await env.DB.prepare(
    `SELECT u.* FROM external_identities e JOIN users u ON u.id = e.user_id
      WHERE e.source = ? AND e.openid = ? LIMIT 1`
  ).bind(source, openid).first();

  let userId;
  if (bound) {
    userId = bound.id;
  } else {
    // 2) 已登录用户在本次请求里带上 token：把 openid 绑定到当前账号
    const current = await getUser(request, env);
    if (current) {
      userId = current.id;
    } else {
      // 3) 未绑定且未登录：返回 needBind，前端跳转手机号登录/注册，登录成功后再调 /api/wechat-bind 绑定
      return json({ ok: true, needBind: true, openid, unionid: unionid || null }, 200);
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO external_identities (user_id, source, openid, unionid, nickname, avatar, channel, bound_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, openid) DO UPDATE SET unionid = excluded.unionid, last_seen_at = excluded.last_seen_at`
  ).bind(userId, source, openid, unionid || null, b.nickname || null, b.avatar || null, b.channel || null, now, now).run();

  const session = await createSession(env, userId);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return json({ ok: true, user: publicUser(u), token: session.token }, 200, { 'Set-Cookie': session.cookie });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
