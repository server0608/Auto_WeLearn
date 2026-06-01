# Auto_WeLearn — Agent Guide

## Project

WeLearn (sflep.com) automation toolkit with two UIs: PyQt5 desktop (`main.py`) and Flask web (`web_app.py`). UI language is Chinese.

## Entrypoints

- **Desktop**: `uv run python main.py` — multi-account manager with course/unit selection, homework and time-attack modes
- **Web**: `uv run python web_app.py` — browser UI at `http://0.0.0.0:8000`, default admin `admin / admin123` (or `$WELEARN_ADMIN_PASSWORD`)

## Commands

```bash
uv sync                    # install deps (preferred)
python -m venv .venv && pip install -r requirements.txt   # pip fallback
uv run python main.py      # desktop app
uv run python web_app.py   # web app (port 8000, set WELEARN_WEB_PORT to change)
```

## Structure

```
core/              # API client, account mgr, crypto, user store, task runner, batch mgr
ui/                # PyQt5 desktop widgets (main_window, account_view, account_detail, workers)
templates/         # Flask Jinja2 templates
data/              # auto-created persistent data
WeLearn.py         # legacy single-file version (not imported, standalone)
```

## Data files

| File | Purpose |
|---|---|
| `data/desktop_accounts.json` | Desktop app account persistence (JSON array of Account objects) |
| `data/users.json` | Web app user store (admin/user roles, werkzeug password hashes) |
| `data/accounts/<username>.json` | Per-user WeLearn account data (web app) |

## Key quirks

- **PyQt5 is Windows-only**. `uv.lock` has `resolution-markers` pinned to `sys_platform == 'win32' and platform_machine == 'AMD64'`. Desktop mode will not work on Linux/macOS. The web UI works cross-platform.
- **uv.lock requires Python >=3.13**; `pyproject.toml` says >=3.12. If uv fails, use pip.
- **No tests, no linter, no typechecker** configured. No CI.
- Web app secret key defaults to `"change-me"` unless `WELEARN_WEB_SECRET` env var is set.
- Login uses SSO with custom base64/timestamp-based password obfuscation (`core/crypto.py`).
- Two task modes: `homework` (submits SCO progress with configurable accuracy) and `time` (simulates watching, concurrent via ThreadPoolExecutor).
- Web task IDs are 8-char hex UUIDs. Tasks run in daemon threads — no persistence, lost on restart.
- Account import supports CSV and TXT; lines starting with `#` are skipped.

## How to add credentials for web

If you need to create web users at first run, set the env var `WELEARN_ADMIN_PASSWORD` before starting. Without it, the default admin password is `admin123`. Admin can create users via the `/admin/users` page, or users can self-register at `/register`.

## Web env vars

| Var | Default | Notes |
|---|---|---|
| `WELEARN_WEB_HOST` | `0.0.0.0` | |
| `WELEARN_WEB_PORT` | `8000` | |
| `WELEARN_WEB_DEBUG` | off | set to `1` to enable |
| `WELEARN_ADMIN_PASSWORD` | `admin123` | only used on first ever run |
| `WELEARN_WEB_SECRET` | `change-me` | Flask session secret; **set a strong value in production** |

## Model

- `Account` (dataclass): `username`, `password`, `nickname`, `status`, `progress` — in `core/account_manager.py`
- `AppUser` (dataclass): `username`, `password_hash`, `role` — in `core/user_store.py`
- `StudyTask` (dataclass): state machine `pending→running→completed/failed/stopped` — in `core/web_tasks.py`
