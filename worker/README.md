# Auto WeLearn - Cloudflare Workers 部署

在 Cloudflare Workers 上运行的 WeLearn 自动学习工具。

## 功能

- 用户注册/登录
- 多账号管理
- 刷作业/刷时长模式
- 任务状态实时查看
- 后台任务执行

## 部署前提

1. [Cloudflare 账号](https://dash.cloudflare.com/)
2. [GitHub 账号](https://github.com/)
3. Node.js 20+

## 快速部署

### 方式一：GitHub Actions（一键部署）

#### 1. Fork 本仓库

#### 2. 配置 Cloudflare 凭证

在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 获取：

- **Account ID**：右侧边栏底部
- **API Token**：Profile → API Tokens → Create Token → Edit Cloudflare Workers

#### 3. 添加 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Secret Name | Value |
|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | 你的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 你的 Account ID |

#### 4. 推送代码

推送后，GitHub Actions 自动部署。访问：
```
https://auto-wellearn.<你的账户>.workers.dev
```

#### 5. 首次登录

默认管理员账号：`admin` / `admin123`

---

### 方式二：本地部署

```bash
cd worker
npm install
npx wrangler login   # 用 Cloudflare 账号授权
npx wrangler deploy   # 部署
```

## 目录结构

```
worker/
├── src/
│   ├── index.ts      # Hono Web 应用入口
│   ├── types.ts      # 类型定义
│   └── kv/
│       ├── store.ts  # KV 存储封装
│       ├── crypto.ts # 密码加密
│       └── welearn.ts # WeLearn API 客户端
├── wrangler.toml     # Cloudflare 配置
├── package.json
└── tsconfig.json
```

## 本地开发

```bash
cd worker
npm install
npx wrangler dev
```

访问 http://localhost:8787

## 注意事项

- 部署后首次访问会自动创建管理员账号
- 任务在后台异步执行，刷新页面查看进度
- KV 数据持久化存储在 Cloudflare KV

## 获取帮助

有问题请提交 [Issue](https://github.com/server0608/Auto_WeLearn/issues)
