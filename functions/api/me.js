import { json } from '../_lib/respond.js';
import { getUser, publicUser } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const u = await getUser(request, env);
  return json({ ok: true, user: u ? publicUser(u) : null });
}
