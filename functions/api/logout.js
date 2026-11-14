import { json } from '../_lib/respond.js';
import { getSessionToken, clearCookie } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method Not Allowed' }, 405);
}
