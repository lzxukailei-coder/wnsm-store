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
