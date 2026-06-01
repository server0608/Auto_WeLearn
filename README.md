# Auto_WeLearn

[![Python](https://img.shields.io/badge/Python-3.12+-blue.svg)](https://www.python.org/)
[![PyQt5](https://img.shields.io/badge/PyQt5-5.15+-green.svg)](https://pypi.org/project/PyQt5/)
[![Flask](https://img.shields.io/badge/Flask-3.0+-black.svg)](https://pypi.org/project/Flask/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)

WeLearn 自动学习工具，提供桌面版多账号控制台和 Web 控制台两套界面，用于管理账号、选择课程单元，并执行刷作业或刷时长任务。

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

## 环境要求

- Python 3.12+
- Windows / macOS / Linux

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

## Cloudflare Workers 部署

将 Web 版部署到 Cloudflare Workers，全球访问，无需服务器。

### 部署前提

1. [Cloudflare 账号](https://dash.cloudflare.com/)
2. [GitHub 账号](https://github.com/)

### 一键部署

1. **Fork 本仓库**

2. **获取 Cloudflare 凭证**
   - Account ID：[Cloudflare Dashboard](https://dash.cloudflare.com/) 右侧边栏底部
   - API Token：Profile → API Tokens → Create Token → Edit Cloudflare Workers

3. **添加 GitHub Secrets**
   - 仓库 → Settings → Secrets and variables → Actions → New repository secret
   - 添加 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`

4. **创建 KV Namespace**
   - [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → KV → Create namespace
   - 命名 `WELEARN_KV`，复制 ID
   - 在 `worker/wrangler.toml` 中替换 `YOUR_KV_NAMESPACE_ID`

5. **推送代码**
   ```bash
   git push origin master
   ```

6. **触发部署**
   - 仓库 → Actions → "Deploy to Cloudflare Workers" → Run workflow

7. **访问**
   ```
   https://auto-wellearn.<你的 workers 域名>.workers.dev
   ```

### 本地开发

```bash
cd worker
npm install
npx wrangler login
npx wrangler dev
```

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
