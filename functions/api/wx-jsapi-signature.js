// 公众号 JS-SDK 签名：公众号文章 / 菜单 / 页面内嵌 H5 调起分享、扫码、客服等能力时由本接口生成签名
// 依赖环境变量 WX_OA_APPID、WX_OA_SECRET；access_token 与 jsapi_ticket 在 D1 缓存，避免触发每日调用上限
import { json, readBody } from '../_lib/respond.js';

const TICKET_CACHE_KEY = 'wx_jsapi_ticket';

async function getCached(env, key) {
  const row = await env.DB.prepare('SELECT value, updated_at FROM settings WHERE key = ?').bind(key).first();
  if (!row) return null;
  const age = Date.now() - new Date(row.updated_at).getTime();
  return age < 7000 * 1000 ? row.value : null;
}

async function cacheSet(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, value, new Date().toISOString()).run();
}

async function fetchAccessToken(env) {
  const cached = await getCached(env, 'wx_access_token');
  if (cached) return cached;
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_OA_APPID}&secret=${env.WX_OA_SECRET}`);
  const data = await r.json();
  if (!data.access_token) throw new Error(data.errmsg || '获取 access_token 失败');
  await cacheSet(env, 'wx_access_token', data.access_token);
  return data.access_token;
}

async function fetchJsapiTicket(env, accessToken) {
  const cached = await getCached(env, TICKET_CACHE_KEY);
  if (cached) return cached;
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`);
  const data = await r.json();
  if (data.errcode !== 0) throw new Error(data.errmsg || '获取 jsapi_ticket 失败');
  await cacheSet(env, TICKET_CACHE_KEY, data.ticket);
  return data.ticket;
}

async function sha1(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  if (!env.WX_OA_APPID || !env.WX_OA_SECRET) {
    return json({ ok: false, error: '公众号未配置 AppID/Secret' }, 503);
  }
  const b = await readBody(request);
  const url = (b.url || '').split('#')[0];
  if (!url) return json({ ok: false, error: '缺少页面 url' }, 400);

  const accessToken = await fetchAccessToken(env);
  const ticket = await fetchJsapiTicket(env, accessToken);
  const nonceStr = Math.random().toString(36).slice(2, 16);
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = await sha1(raw);

  return json({
    ok: true,
    appId: env.WX_OA_APPID,
    timestamp,
    nonceStr,
    signature
  });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
