# Auto WeLearn - Cloudflare Workers 部署

在 Cloudflare Workers 上运行的 Auto WeLearn Web 控制台。该目录是独立的 TypeScript/Hono 实现，不直接运行 Python Flask。

仓库部署分支为 `main`。不要向 `master` 分支提交或推送改动。

## 功能

- 用户注册/登录
- 多账号管理
- 刷作业/刷时长模式
- 任务状态实时查看
- KV 持久化用户、账号、任务记录

## 部署前提

1. [Cloudflare 账号](https://dash.cloudflare.com/)
2. [GitHub 账号](https://github.com/)
3. Node.js 20+
4. Cloudflare KV Namespace

## 配置文件

`wrangler.toml` 是 Workers 部署配置：

```toml
name = "auto-welearn-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "WELEARN_KV"
id = "YOUR_KV_NAMESPACE_ID"
```

部署前必须把 `YOUR_KV_NAMESPACE_ID` 替换为真实 KV ID。

## 快速部署

### 方式一：GitHub Actions（一键部署）

仓库根目录 `.github/workflows/deploy-worker.yml` 会在 `main` 分支触发部署。触发路径为 `worker/**` 和部署工作流文件本身。

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

推送到 `main` 分支后，GitHub Actions 自动部署。访问：
```
https://auto-welearn.<你的账户>.workers.dev
```

#### 5. 首次登录

默认管理员账号：`admin` / `admin123`

生产环境建议设置 Secret 覆盖默认密码：

```bash
npx wrangler secret put WELEARN_ADMIN_PASSWORD
```

该密码只在 KV 中没有任何用户时生效。

---

### 方式二：本地部署

```bash
cd worker
npm install
npx wrangler login   # 用 Cloudflare 账号授权
npx wrangler kv namespace create WELEARN_KV
# 将输出的 id 写入 wrangler.toml 的 kv_namespaces.id
npm run typecheck
npx wrangler deploy   # 部署
```

如果已经在 Cloudflare Dashboard 创建 KV，可以直接复制 Dashboard 中的 namespace ID 到 `wrangler.toml`。

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
npm run typecheck
npx wrangler dev
```

访问 http://localhost:8787

## KV 数据

| Key | 内容 |
|-----|------|
| `users` | 用户表，包含管理员和普通用户 |
| `accounts:<username>` | 每个 Web 用户绑定的 WeLearn 账号列表 |
| `tasks` | 任务记录、状态、日志和结果 |
| `session:<random>` | 登录会话，默认 7 天过期 |

## 注意事项

- 部署后首次访问会自动创建管理员账号
- 任务通过 `ctx.waitUntil()` 在请求结束后继续执行，刷新页面查看进度
- KV 数据持久化存储在 Cloudflare KV
- Cloudflare KV 是最终一致性存储，任务日志和状态刷新可能存在短暂延迟。
- Cloudflare Workers 不适合稳定执行长时间常驻任务。刷作业等短任务更适合 Workers；刷时长配置过长时可能受 Worker 请求生命周期和平台资源限制影响，需要稳定长时间运行请使用 Python Web 版。
- 修改默认管理员密码应使用 Secret，不建议把生产密码写入 `wrangler.toml`。

## 获取帮助

有问题请提交 [Issue](https://github.com/server0608/Auto_WeLearn/issues)
