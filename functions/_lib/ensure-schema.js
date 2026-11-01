// 新增表的幂等自检建表：项目通过 Cloudflare Pages 部署，本地/CI 无法直接执行 d1 migrate，
// 因此在首次访问相关接口时自动 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。
// 语句与 schema.sql 保持一致；重复执行安全，已存在的表与索引不会被改动。

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS external_identities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    source       TEXT NOT NULL,
    openid       TEXT,
    unionid      TEXT,
    nickname     TEXT,
    avatar       TEXT,
    channel      TEXT,
    bound_at     TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ext_user ON external_identities(user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uniq_ext_source_openid ON external_identities(source, openid)`,

  `CREATE TABLE IF NOT EXISTS channel_tracks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    source     TEXT NOT NULL,
    medium     TEXT,
    campaign   TEXT,
    referrer   TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_track_user ON channel_tracks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_track_source ON channel_tracks(source)`
];

let pending = null;

// 同一运行实例内只跑一次；失败时不缓存，下次请求可重试。
export async function ensureNewTables(env) {
  if (pending) return pending;
  pending = (async () => {
    const errors = [];
    for (const sql of STATEMENTS) {
      try {
        await env.DB.prepare(sql).run();
      } catch (e) {
        errors.push(String(e && e.message || e));
      }
    }
    if (errors.length) {
      pending = null; // 允许下次重试
      throw new Error('建表失败: ' + errors.join('; '));
    }
  })();
  try {
    await pending;
  } catch (e) {
    pending = null;
    throw e;
  }
  return true;
}
