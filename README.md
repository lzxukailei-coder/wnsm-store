# wnsm.store

手机渠道报价网站，自动爬取八方报价单（lzbftx.vip），C 端看零售价、B 端同行看批发价，价格全部在服务端计算、原始成本价不下发。

## 技术栈

- 前端：纯 HTML/CSS/JS（移动端优先）
- 后端：Cloudflare Pages Functions（无独立服务器，按请求运行）
- 数据库：Cloudflare D1（SQLite）
- 部署：Cloudflare Pages + GitHub Actions 自动化
- 数据：crawler.js 每日定时爬取八方报价单并生成 data.json

## 项目结构

```
.
├── index.html                  # C 端主页面（报价列表 + 真实登录注册）
├── admin.html                  # 管理员审核后台（同行资质审核）
├── data.json                   # 八方原始报价（爬虫生成，外部访问 403 拦截）
├── crawler.js                  # 八方报价单爬虫
├── wrangler.toml               # Pages 配置 + D1 绑定（binding 名 DB）
├── schema.sql                  # D1 建表语句
├── functions/
│   ├── data.json.js            # 拦截外部直接访问 data.json（成本价保护）
│   ├── _lib/
│   │   ├── auth.js             # PBKDF2(10万次) 哈希、会话 Cookie
│   │   ├── catalog.js          # 读 data.json + 服务端定价/分级
│   │   └── respond.js          # JSON 响应与校验
│   └── api/
│       ├── register.js         # 注册（C 即通过 / B 待审核）
│       ├── login.js            # 登录
│       ├── logout.js           # 退出
│       ├── me.js               # 当前登录用户
│       ├── products.js         # 商品列表（按身份返回展示价）
│       └── admin/
│           ├── users.js        # 管理员：用户列表
│           ├── approve.js      # 管理员：通过/驳回同行
│           ├── settings.js     # 管理员：全局每台毛利
│           ├── preview.js      # 管理员：定价构成预览（含成本）
│           └── overrides/      # 管理员：SKU 底价规则（列表/增删、批量导入）
│               ├── index.js
│               └── bulk.js
└── .github/workflows/
    ├── crawl.yml               # 定时爬取（每天 UTC 0:00 / 北京 8:00）
    └── deploy.yml              # push 到 main 自动部署
```

## 账号与价格分级

| 身份 | 注册 | 看到的价格 |
|---|---|---|
| 未登录 | — | 不显示价格，引导登录 |
| C 端个人客户 | 注册即通过 | 零售价 = 八方公开价 + 阶梯加价 |
| B 端同行·审核中 | 提交门店/联系人/执照 | 暂看零售价，标“审核中” |
| B 端同行·已通过 | 管理员审核 | 批发价 = 八方公开价 − 30 |
| 管理员 | 数据库内置 | 进入 /admin.html 审核同行 |

零售价阶梯：公开价 <2000 加 200；2000–5000 加 300；5000–10000 加 500；≥10000 加 800。
缺货（tags 含“缺货”或价格 <100）显示“缺货/待报价”，无价格。

### SKU 底价保护（防止亏本出货）

后台 `/admin.html` →「底价管理」可配置，规则缓存在服务端、改后约 1 分钟生效：

- **全局每台毛利** `b_margin`（默认 50）：B 端兜底价 = 八方会员价（公开价−80）+ 每台毛利。
- **单条规则**按 产品 id（精确） / 型号 model（精确） / 名称关键词（包含一批）匹配，优先级 id > model > name，可填：
  - 成本价 `cost`：你的真实拿货价。保证 **B 端 ≥ 成本 + 毛利**、**C 端 ≥ 成本 + 100**；
  - 硬底价 `floor`：B 端绝不低于此；
  - 固定价 `fixed`：直接作为 B 端批发价（最高优先级）。
- 支持 CSV 批量导入（`类型,匹配值,成本,硬底价,固定价,备注`），并可按型号搜索预览公开价/会员价/成本/底价/最终售价。

**批量录入工具**：`node build-cost-template.mjs` 依据当前 data.json 生成 9 个品牌清单（`成本_01_苹果.csv` … `成本_09_其他品牌.csv`，平板单独成表），只含在库、公开价≥5000 的手机+平板，按产品 id 精确匹配。文件内同机型按内存聚拢，同颜色的「激活/原封」相邻（贵机型排在前），备注标注渠道【激活】/【原封】/【官网】/【国补】与公开价。成本表已在 `.gitignore` 忽略（含真实拿货价，禁止提交）。只对**拿货价高于八方会员价（公开价−80）**的机型填「成本」，删掉其余空行，再把内容粘到后台「批量导入」；拿货价更低的机型无需填，全局毛利已自动让你赚得更多。



### 安全机制

- 原始 `data.json` 含八方成本价：`functions/data.json.js` 对所有外部请求返回 403；函数内部通过 `env.ASSETS.fetch('/data.json')` 读取（5 分钟内存缓存）。
- `/api/products` 只返回按身份计算后的 `displayPrice`，永不下发原始 `price`、`shopId`、`sourceId`。
- 密码：PBKDF2-SHA256、10 万次迭代、每用户 16 字节随机 salt，不存明文。
- 会话：32 字节随机 token 存 D1，经 `httpOnly + Secure + SameSite=Lax` Cookie 下发（名 `wnsm_session`，30 天）。

## 本地复现 / 重建

```bash
# 1. 创建 D1 数据库
npx wrangler d1 create wnsm-db
#   将返回的 database_id 填入 wrangler.toml 的 [[d1_databases]]

# 2. 建表（远程）
npx wrangler d1 execute wnsm-db --remote --file schema.sql

# 3. 本地部署
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler pages deploy . --project-name=wnsm-store --branch=main --commit-dirty=true
```

管理员账户需直接写入 D1（密码哈希算法须与 functions/_lib/auth.js 一致：PBKDF2-SHA256、10 万次、salt 拼接）。

## 定时爬虫

- `.github/workflows/crawl.yml` 每天 UTC 0:00（北京 8:00）运行 `node crawler.js`，自动 commit/push data.json。
- push 触发 deploy.yml 自动部署。

## 待做

- [ ] 录入各机型真实拿货价/底价（当前仅全局毛利兜底，建议优先覆盖高价与走量机型）
- [ ] 域名 wnsm.store 接入 Cloudflare（Add site + 阿里云改 NS + Pages 自定义域名）
- [ ] B 端营业执照图片上传（当前为文本字段）
- [ ] 管理员/用户修改密码、找回密码
- [ ] 价格涨跌对比（历史数据）
- [ ] 型号聚合视图、购物车/下单流程
- [ ] 多供应商比价、微信客服对接
