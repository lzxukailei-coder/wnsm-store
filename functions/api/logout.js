import { json } from '../_lib/respond.js';
import { parseCookies, COOKIE_NAME, clearCookie } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const token = parseCookies(request.headers.get('Cookie') || '')[COOKIE_NAME];
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
