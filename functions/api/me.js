import { json } from '../_lib/respond.js';
import { getUser, publicUser, COOKIE_NAME } from '../_lib/auth.js';
import { parseCookies } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const u = await getUser(request, env);
  const headerToken = request.headers.get('X-Wnsm-Token') || '';
  const cookieToken = parseCookies(request.headers.get('Cookie') || '')[COOKIE_NAME] || '';
  const token = headerToken || cookieToken;
  return json({ ok: true, user: u ? publicUser(u) : null, token: u && token ? token : undefined });
}
