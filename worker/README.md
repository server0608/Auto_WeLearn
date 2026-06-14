# WeLearn Worker

Cloudflare Workers 网页版后台，使用 Durable Object 存储数据，部署后无需手动创建 KV。

## 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/server0608/Auto_WeLearn&name=welearn-worker)

点击按钮后，在 Cloudflare 页面导入此仓库并部署。如果页面要求选择项目目录，请选择 `worker`。部署完成后访问 Worker 域名，使用默认管理员登录：

- 用户名：`admin`
- 密码：`admin123`

## 默认变量

`wrangler.toml` 已内置默认变量：

```toml
SECRET_KEY = "change-me-random-string"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"
```

正式使用建议在 Cloudflare Dashboard 的 Worker Variables 中修改：

- `SECRET_KEY`：随机长字符串，用于签名登录会话
- `ADMIN_USERNAME`：默认管理员用户名
- `ADMIN_PASSWORD`：默认管理员密码

注意：默认管理员只会在 Durable Object 数据为空时创建。已经部署并登录过之后，修改 `ADMIN_PASSWORD` 不会自动重置已有管理员密码。

## 功能

- 用户登录 / 注册
- 管理员用户管理
- WeLearn 多账号管理
- 课程和单元选择
- 刷作业任务
- 刷时长任务（Cron 每分钟自动推进）

## 安全说明

- WeLearn 账号密码需要用于后续自动登录，因此会存储在 Worker 的 Durable Object 中。
- 请只部署到你自己的 Cloudflare 账号，不要开放给不可信用户使用。
- 正式使用前请修改 `ADMIN_PASSWORD` 和 `SECRET_KEY`。
- 如果已经用默认管理员登录过，修改 `ADMIN_PASSWORD` 不会重置已有管理员；请在后台创建新管理员后删除默认管理员，或清空 Durable Object 数据后重新初始化。

## 本地开发

```bash
npm install
npm run dev
```

## 手动部署

```bash
npm run deploy
```

## 部署机制

- 数据存储：Durable Object `WeLearnState`
- 定时任务：Cron Trigger 每分钟运行一次
- 不依赖 KV Namespace，因此更适合一键部署
