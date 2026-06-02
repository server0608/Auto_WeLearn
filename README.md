# Auto_WeLearn

[![Python](https://img.shields.io/badge/Python-3.12+-blue.svg)](https://www.python.org/)
[![PyQt5](https://img.shields.io/badge/PyQt5-5.15+-green.svg)](https://pypi.org/project/PyQt5/)
[![Flask](https://img.shields.io/badge/Flask-3.0+-black.svg)](https://pypi.org/project/Flask/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)

WeLearn 自动学习工具，提供桌面版、Python Web 控制台和 Cloudflare Workers Web 控制台，用于管理账号、选择课程单元，并执行刷作业或刷时长任务。

仓库地址：`https://github.com/server0608/Auto_WeLearn`

## 免责声明

- 项目仅供学习和技术研究使用。
- 请勿将本项目用于牟利、代刷或违反平台规则的用途。
- 使用者需自行承担由此带来的风险和后果。

## 功能概览

### 桌面版

- 多账号管理，支持新增、删除、导入、导出。
- 本地自动保存账号，重启后无需重新录入。
- 课程与单元选择界面独立，适合逐个账号精细操作。
- 支持刷作业和刷时长两种模式。

### Web 版

- 管理员 / 普通用户分级。
- 浏览器内完成用户管理、账号管理和任务提交。
- 后台任务可查看日志、停止运行。
- 支持正确率区间、随机时长与并发刷时长。

### Cloudflare Workers 版

- 使用 TypeScript + Hono 实现，位于 `worker/`。
- 使用 Cloudflare KV 存储用户、账号、任务和会话数据。
- 支持 GitHub Actions 自动部署到 `main` 分支。
- 不依赖 Python 运行时，适合无需自备服务器的 Web 控制台场景。

## 环境要求

### Python 本地版

- Python 3.12+
- Python Web 版支持 Windows / macOS / Linux
- 桌面版依赖 PyQt5，当前锁文件主要面向 Windows AMD64 环境

### Cloudflare Workers 版

- Node.js 20+
- Cloudflare 账号
- Cloudflare KV Namespace
- Wrangler CLI，通常通过 `npx wrangler ...` 使用

## 安装与运行

### 使用 uv

```bash
git clone https://github.com/server0608/Auto_WeLearn.git
cd Auto_WeLearn

uv sync
uv run python main.py
```

启动 Web 控制台：

```bash
uv run python web_app.py
```

### 使用 pip

```bash
git clone https://github.com/server0608/Auto_WeLearn.git
cd Auto_WeLearn

python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

启动 Web 控制台：

```bash
python web_app.py
```

## 使用说明

### 桌面版

1. 运行 `python main.py`。
2. 在主界面添加账号，或通过“文件 -> 导入账号”批量导入。
3. 双击账号或点击“管理”打开详情窗口。
4. 登录账号后拉取课程，选择单元和执行模式。
5. 查看实时日志，必要时停止任务。

桌面版账号默认保存到 `data/desktop_accounts.json`。

### Web 版

1. 运行 `python web_app.py`。
2. 打开 `http://127.0.0.1:8000`。
3. 首次启动会自动创建管理员账号：`admin / admin123`。
4. 管理员可创建普通用户；普通用户也可以通过 `/register` 自助注册。
5. 登录后添加 WeLearn 账号，进入课程页选择单元并提交任务。

可选环境变量：

- `WELEARN_WEB_HOST`：Web 服务监听地址，默认 `0.0.0.0`
- `WELEARN_WEB_PORT`：Web 服务端口，默认 `8000`
- `WELEARN_WEB_DEBUG`：是否开启调试，`1` 为开启
- `WELEARN_ADMIN_PASSWORD`：首次初始化时默认管理员密码
- `WELEARN_WEB_SECRET`：Flask session 密钥，生产环境必须设置强随机值

## 账号导入格式

### CSV

```csv
用户名,密码,昵称
student1,password1,张三
student2,password2,李四
```

### TXT

```text
student1,password1,昵称1
student2,password2
# 以 # 开头的行会被忽略
```

## 数据目录

- `data/desktop_accounts.json`：桌面版账号持久化文件
- `data/users.json`：Web 控制台用户数据
- `data/accounts/<username>.json`：Web 控制台下每个登录用户的 WeLearn 账号数据

Cloudflare Workers 版不使用本地 `data/` 目录，数据写入绑定名为 `WELEARN_KV` 的 Cloudflare KV。

## Cloudflare Workers 部署

`worker/` 目录提供了一个可部署到 Cloudflare Workers 的 TypeScript/Hono 版本。它不是直接运行 Python Flask，而是把 Web 控制台、WeLearn API 客户端、用户/账号/任务存储迁移到 Workers + KV。

Cloudflare Workers 不适合执行长时间常驻任务。刷作业这类短任务更适合部署在 Workers；刷时长模式如果配置很长时间，可能受 Worker 请求生命周期、`waitUntil` 和平台资源限制影响。需要稳定长时间运行时，仍建议使用本地/服务器版 `web_app.py`。

### 部署前提

1. [Cloudflare 账号](https://dash.cloudflare.com/)
2. [GitHub 账号](https://github.com/)
3. Node.js 20+
4. Cloudflare KV Namespace

### Workers 配置文件

部署入口在 `worker/wrangler.toml`：

```toml
name = "auto-welearn-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "WELEARN_KV"
id = "YOUR_KV_NAMESPACE_ID"
```

创建 KV 后，必须把 `YOUR_KV_NAMESPACE_ID` 替换为真实 ID，否则无法部署。

### GitHub Actions 部署

仓库已提供 `.github/workflows/deploy-worker.yml`。它只监听 `main` 分支，并且只在 `worker/**` 或部署工作流变更时触发。

`master` 分支不用于部署，也不应提交或推送任何改动。

1. **Fork 本仓库**

2. **获取 Cloudflare 凭证**
   - Account ID：[Cloudflare Dashboard](https://dash.cloudflare.com/) 右侧边栏底部
   - API Token：Profile → API Tokens → Create Token → Edit Cloudflare Workers

3. **添加 GitHub Secrets**
   - 仓库 → Settings → Secrets and variables → Actions → New repository secret
   - 添加 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`

4. **创建 KV Namespace**
   - [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → KV → Create namespace
   - 命名例如 `auto-welearn-kv`，复制 ID
   - 在 `worker/wrangler.toml` 中替换 `YOUR_KV_NAMESPACE_ID`

5. **推送代码**
   ```bash
   git push origin main
   ```

6. **触发部署**
   - 推送到 `main` 后自动触发
   - 也可以在仓库 Actions 页面手动运行 "Deploy Worker"

7. **访问**
   ```
   https://auto-welearn.<你的 workers 域名>.workers.dev
   ```

默认管理员账号为 `admin / admin123`。生产环境建议通过 Cloudflare Secret 覆盖默认密码：

```bash
cd worker
npx wrangler secret put WELEARN_ADMIN_PASSWORD
```

该密码只在 KV 中还没有任何用户时用于初始化管理员。

### 手动部署

```bash
cd worker
npm install
npx wrangler kv namespace create WELEARN_KV
# 将输出的 id 写入 worker/wrangler.toml
npm run typecheck
npx wrangler deploy
```

如果已经在 Cloudflare Dashboard 手动创建 KV，也可以跳过 `wrangler kv namespace create`，直接把 Dashboard 中的 KV ID 填入 `worker/wrangler.toml`。

### 本地开发

```bash
cd worker
npm install
npx wrangler login
npm run typecheck
npx wrangler dev
```

本地访问默认地址为 `http://localhost:8787`。

### Workers 数据与限制

- `users`：用户表，保存管理员和普通用户。
- `accounts:<username>`：每个 Web 用户绑定的 WeLearn 账号列表。
- `tasks`：任务记录、状态、日志和结果。
- `session:<random>`：登录会话，默认 7 天过期。
- 任务通过 `ctx.waitUntil()` 在响应结束后继续执行，但 Workers 不是长期任务运行环境。
- 刷作业等短任务更适合 Workers；刷时长如果配置很长时间，建议使用 Python Web 版。
- Cloudflare KV 是最终一致性存储，任务日志刷新可能存在短暂延迟。

### 项目结构

```text
Auto_WeLearn/
├── core/                    # 核心逻辑
├── ui/                      # PyQt5 桌面界面
├── templates/               # Flask Web 模板
├── data/                    # 本地数据目录
├── main.py                  # 桌面版入口
├── web_app.py               # Web 版入口
├── WeLearn.py               # 原始单文件兼容版本
├── pyproject.toml           # 项目配置
├── requirements.txt          # pip 依赖
└── worker/                  # Cloudflare Workers 部署
    ├── src/                 # TypeScript 源码
    ├── wrangler.toml        # Workers 配置
    └── README.md            # Workers 部署说明
```
