# wnsm.store

手机渠道报价网站，自动爬取八方报价单，区分 C 端零售价与 B 端批发价。

## 技术栈

- 前端：纯 HTML/CSS/JS（移动端优先）
- 部署：Cloudflare Pages
- 自动化：GitHub Actions
- 数据：自动爬取八方报价单

## 项目结构

```
.
├── index.html              # 主页面（报价列表 + 登录注册）
├── data.json               # 报价数据（爬虫自动生成）
├── crawler.js              # 八方报价单爬虫
├── .github/workflows/
│   ├── crawl.yml           # 定时爬取（每天 UTC 0:00 / 北京 8:00）
│   └── deploy.yml          # 自动部署到 Cloudflare Pages
└── README.md
```

## 定价规则

| 用户类型 | 价格逻辑 |
|---|---|
| 未登录 | 不显示价格，提示登录 |
| C 端个人客户 | 八方公开价 + 阶梯加价（200-800） |
| B 端同行（已认证） | 八方会员价（公开价 - 80）+ 50 |

## 首次部署步骤

### 1. 创建 GitHub 仓库

```bash
git init
git add .
git commit -m "init: wnsm.store 报价网站"
git branch -M main
git remote add origin https://github.com/你的用户名/wnsm-store.git
git push -u origin main
```

### 2. 获取 Cloudflare API Token

1. 登录 https://dash.cloudflare.com
2. 右上角头像 → My Profile → API Tokens
3. Create Token → Edit zone DNS 模板或自定义
4. 权限需要：
   - Account → Cloudflare Pages → Edit
   - User → User Details → Read
5. 复制 Token 和 Account ID

### 3. 配置 GitHub Secrets

在 GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 上一步复制的 Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID（Dashboard 右侧） |

### 4. 创建 Cloudflare Pages 项目

1. Cloudflare Dashboard → Workers & Pages → Create → Pages
2. 方式一：直接连接 GitHub 仓库（推荐）
3. 方式二：等 GitHub Actions 自动部署（首次需要先手动创建项目）

### 5. 绑定自定义域名

1. Pages 项目 → Custom domains → Set up a custom domain
2. 输入 `wnsm.store`
3. 按提示在 Cloudflare DNS 添加记录

### 6. 域名 DNS 托管到 Cloudflare

如果域名在阿里云：

1. Cloudflare → Add a site → 输入 `wnsm.store`
2. 选择 Free 计划
3. 复制 Cloudflare 分配的两个 NS 地址
4. 阿里云域名控制台 → DNS 修改 → 改为 Cloudflare 的 NS
5. 等待生效（几分钟到几小时）

## 手动运行爬虫

```bash
node crawler.js
```

需要 Node.js 18+（内置 fetch）。

## 后续待做

- [ ] 后端真实注册登录（Cloudflare Workers + D1）
- [ ] B 端营业执照上传审核
- [ ] 价格涨跌对比（历史数据）
- [ ] 型号聚合视图
- [ ] 购物车/下单流程
- [ ] 多供应商比价
- [ ] 微信客服对接
