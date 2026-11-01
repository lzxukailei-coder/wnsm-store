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

-- 跨端身份绑定：同一手机号用户在微信小程序/公众号/视频号/网页等不同端的 openid、unionid 映射
-- source: miniprogram=微信小程序  official=微信公众号  channels=视频号  web=官网  douyin=抖音  kuaishou=快手  xhs=小红书
CREATE TABLE IF NOT EXISTS external_identities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  source      TEXT NOT NULL,
  openid      TEXT,
  unionid     TEXT,
  nickname    TEXT,
  avatar      TEXT,
  channel     TEXT,                              -- 渠道归因：来自哪个平台/哪条内容/哪个二维码
  bound_at    TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ext_user ON external_identities(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ext_source_openid ON external_identities(source, openid);

-- 跨端来源归因记录：用户从各平台内容/二维码进入时打上 utm 渠道标记，后续注册/成交可回溯
CREATE TABLE IF NOT EXISTS channel_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  source      TEXT NOT NULL,                     -- wechat_mp / wechat_oa / wechat_channels / douyin / kuaishou / xhs / web
  medium      TEXT,                              -- 内容形式：video / article / qrcode / search / direct
  campaign    TEXT,                              -- 活动/素材编号
  referrer    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_track_user ON channel_tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_track_source ON channel_tracks(source);
