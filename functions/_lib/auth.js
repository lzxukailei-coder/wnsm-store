// 认证与会话工具：PBKDF2 密码哈希、随机 token、httpOnly Cookie、当前用户查询

export const COOKIE_NAME = 'wnsm_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// 生成密码学随机十六进制串
export function randomHex(byteLen) {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

// PBKDF2-SHA256 密码哈希
export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

// 仅返回可下发给前端的用户字段
export function publicUser(u) {
  return {
    id: u.id,
    phone: u.phone,
    role: u.role,
    status: u.status,
    company: u.company || '',
    contact: u.contact || '',
    businessLicense: u.business_license || ''
  };
}

// 根据请求 Cookie 解析当前登录用户（校验过期），未登录返回 null
export async function getUser(request, env) {
  const token = parseCookies(request.headers.get('Cookie') || '')[COOKIE_NAME];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.phone, u.role, u.status, u.company, u.contact, u.business_license, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`
  ).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    id: row.id,
    phone: row.phone,
    role: row.role,
    status: row.status,
    company: row.company,
    contact: row.contact,
    business_license: row.business_license
  };
}

// 创建会话并返回 Set-Cookie 头值
export async function createSession(env, userId) {
  const token = randomHex(32);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_DAYS * 86400 * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, createdAt, expiresAt).run();
  const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=${new Date(expiresAt).toUTCString()}`;
  return { token, cookie, expiresAt };
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
