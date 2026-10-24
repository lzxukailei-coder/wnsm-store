-- wnsm.store 后端表结构（Cloudflare D1 / SQLite）
-- 用户表：C 端个人客户、B 端同行（需审核）、admin 管理员
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  phone            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  salt             TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'C',          -- C=个人客户  B=同行/渠道商  admin=管理员
  status           TEXT NOT NULL DEFAULT 'approved',  -- approved=正常  pending=待审核  rejected=已驳回
  company          TEXT,                              -- B 端：公司/门店名称
  contact          TEXT,                              -- B 端：联系人
  business_license TEXT,                              -- B 端：营业执照编号
  reject_reason    TEXT,                              -- 驳回原因
  created_at       TEXT NOT NULL
);

-- 会话表：登录后下发随机 token，经 httpOnly Cookie 携带
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);

-- 全局键值设置（如 B 端每台最低毛利 b_margin）
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- SKU 底价保护规则：按 id(精确) / model(型号) / name(名称关键词) 匹配，优先级 id > model > name
CREATE TABLE IF NOT EXISTS price_overrides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_type  TEXT NOT NULL DEFAULT 'name',  -- id=产品id精确  model=型号精确  name=名称包含关键词
  match_value TEXT NOT NULL,
  cost        REAL,                          -- 你的实际拿货价（可空）
  floor       REAL,                          -- B 端硬底价（可空，售价不得低于此）
  fixed       REAL,                          -- B 端固定售价（可空，最高优先级）
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_overrides_match ON price_overrides(match_type, match_value);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_overrides_rule ON price_overrides(match_type, match_value);
