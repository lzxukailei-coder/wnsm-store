// 渠道归因：各平台内容/二维码进入时上报来源，注册与成交可回溯到具体平台与素材
// 前端进入小程序/官网时读取路径参数（source / medium / campaign）或渠道二维码 scene，POST 到这里落库
import { json, readBody } from '../_lib/respond.js';
import { getUser } from '../_lib/auth.js';

const ALLOWED = new Set([
  'wechat_mp', 'wechat_oa', 'wechat_channels', 'web',
  'douyin', 'kuaishou', 'xhs', 'direct'
]);

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const source = (b.source || '').trim();
  if (!ALLOWED.has(source)) return json({ ok: false, error: '未知渠道来源' }, 400);

  const me = await getUser(request, env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO channel_tracks (user_id, source, medium, campaign, referrer, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(me ? me.id : null, source, (b.medium || null), (b.campaign || null), (b.referrer || null), now).run();

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
