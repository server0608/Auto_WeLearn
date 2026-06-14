import type { Account, Course, Task, Unit, User } from './types';

const CSS = `
:root{--bg:#0f172a;--panel:#111827;--accent:#22c55e;--text:#e5e7eb;--muted:#94a3b8;--danger:#ef4444;--warning:#f59e0b}
*{box-sizing:border-box}body{font-family:"Segoe UI","PingFang SC",sans-serif;background:radial-gradient(circle at 20% 20%,#122043,#0f172a 40%);color:var(--text);margin:0;min-height:100vh}header{background:rgba(17,24,39,.75);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.08);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px}nav a{color:var(--text);text-decoration:none;margin-right:14px;font-weight:700}nav a:hover{color:var(--accent)}.container{width:min(1080px,94%);margin:26px auto 40px}.card{background:var(--panel);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:18px;margin-bottom:16px;box-shadow:0 20px 60px rgba(0,0,0,.25)}h1,h2,h3{color:#f8fafc;margin:0 0 12px}form{display:grid;gap:12px}label{font-weight:600;color:#cbd5e1}input,select{padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#0b1224;color:var(--text);width:100%}button,.button{display:inline-block;padding:10px 14px;border-radius:10px;border:none;font-weight:800;cursor:pointer;background:linear-gradient(120deg,#22c55e,#16a34a);color:#0b1224;text-decoration:none}button.secondary,.button.secondary{background:#1f2937;color:var(--text)}button.danger{background:#b91c1c;color:#fff}table{width:100%;border-collapse:collapse}th,td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left}th{color:#a5b4fc}.flash{padding:12px 14px;border-radius:12px;margin-bottom:12px}.success{background:rgba(34,197,94,.12);color:#bbf7d0}.danger{background:rgba(239,68,68,.14);color:#fecdd3}.warning{background:rgba(245,158,11,.14);color:#fde68a}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.logs{background:#0b1224;border-radius:8px;padding:12px;font-family:Consolas,monospace;font-size:13px;max-height:360px;overflow:auto}.muted{color:var(--muted)}@media(max-width:720px){.form-row{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}}
`;

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

function page(title: string, body: string, user?: User | null): string {
  const nav = user
    ? `<a href="/dashboard">账号</a><a href="/tasks">任务</a>${user.role === 'admin' ? '<a href="/admin/users">用户</a>' : ''}<form method="post" action="/logout" style="display:inline"><button class="secondary">退出</button></form>`
    : '<a href="/login">登录</a><a href="/register">注册</a>';

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><header><div><strong>WeLearn Worker</strong>${user ? ` <span class="muted">${escapeHtml(user.username)} / ${escapeHtml(user.role)}</span>` : ''}</div><nav>${nav}</nav></header><main class="container">${body}</main></body></html>`;
}

function flash(message?: string, type = 'warning'): string {
  return message ? `<div class="flash ${escapeHtml(type)}">${escapeHtml(message)}</div>` : '';
}

export function renderLoginPage(message?: string, type?: string): string {
  return page('登录 - WeLearn Worker', `${flash(message, type)}<div class="card"><h2>登录</h2><form method="post" action="/login"><label>用户名</label><input name="username" autocomplete="username" required><label>密码</label><input name="password" type="password" autocomplete="current-password" required><button>登录</button></form><p class="muted">默认管理员：<code>admin</code> / <code>admin123</code>。可通过 Worker 变量 ADMIN_USERNAME / ADMIN_PASSWORD 覆盖。</p></div>`);
}

export function renderRegisterPage(message?: string): string {
  return page('注册', `${flash(message, 'danger')}<div class="card"><h2>用户注册</h2><form method="post" action="/register"><label>用户名</label><input name="username" required><label>密码</label><input name="password" type="password" required><label>确认密码</label><input name="confirm" type="password" required><button>注册</button></form></div>`);
}

export function renderDashboard(user: User, accounts: Account[], tasks: Task[], message?: string, type?: string): string {
  const accountRows = accounts.map((account) => `<tr><td>${escapeHtml(account.username)}</td><td>${escapeHtml(account.nickname || '-')}</td><td class="actions"><a class="button" href="/courses?account=${encodeURIComponent(account.username)}">进入课程</a><form method="post" action="/accounts/delete"><input type="hidden" name="username" value="${escapeHtml(account.username)}"><button class="danger">删除</button></form></td></tr>`).join('');
  const taskItems = tasks.slice().reverse().map((task) => `<div style="margin:8px 0;padding:10px;background:#0b1224;border-radius:8px"><strong>${escapeHtml(task.courseName)}</strong> <span class="muted">${escapeHtml(task.mode)} / ${escapeHtml(task.status)}</span> <a href="/tasks/${escapeHtml(task.id)}">查看</a></div>`).join('');

  return page('控制台', `${flash(message, type)}<div class="card"><h2>添加 WeLearn 账号</h2><form method="post" action="/accounts/add"><div class="form-row"><input name="username" placeholder="WeLearn 用户名" required><input name="password" placeholder="WeLearn 密码" type="password" required></div><input name="nickname" placeholder="昵称（可选）"><button>添加账号</button></form></div><div class="card"><h3>账号列表</h3><table><thead><tr><th>用户名</th><th>昵称</th><th>操作</th></tr></thead><tbody>${accountRows || '<tr><td colspan="3" class="muted">暂无账号</td></tr>'}</tbody></table></div><div class="card"><h3>最近任务</h3>${taskItems || '<p class="muted">暂无任务</p>'}</div>`, user);
}

export function renderCourses(user: User, account: Account, courses: Course[], message?: string): string {
  const items = courses.map((course) => `<div style="margin:8px 0;padding:10px;background:#0b1224;border-radius:8px"><strong>${escapeHtml(course.cname)}</strong><div class="actions" style="margin-top:8px"><a class="button" href="/units?account=${encodeURIComponent(account.username)}&cid=${encodeURIComponent(course.cid)}&course_name=${encodeURIComponent(course.cname)}">选择单元</a></div></div>`).join('');
  return page('选择课程', `${flash(message, 'danger')}<div class="card"><h2>${escapeHtml(account.nickname || account.username)} 的课程</h2>${items || '<p class="muted">没有找到课程</p>'}</div>`, user);
}

export function renderUnits(user: User, account: Account, courseName: string, cid: string, uid: string, classid: string, units: Unit[]): string {
  const unitOptions = units.map((unit, index) => `<label style="display:block;padding:8px;background:#0b1224;border-radius:8px;margin:4px 0"><input type="checkbox" name="units" value="${index}"> ${escapeHtml(unit.name || unit.unitname || `单元 ${index + 1}`)}</label>`).join('');
  return page('选择单元', `<form method="post" action="/tasks/start"><input type="hidden" name="account_username" value="${escapeHtml(account.username)}"><input type="hidden" name="cid" value="${escapeHtml(cid)}"><input type="hidden" name="course_name" value="${escapeHtml(courseName)}"><input type="hidden" name="uid" value="${escapeHtml(uid)}"><input type="hidden" name="classid" value="${escapeHtml(classid)}"><div class="card"><h2>${escapeHtml(courseName)}</h2><h3>选择单元</h3>${unitOptions || '<p class="muted">没有单元</p>'}</div><div class="card"><h3>任务设置</h3><label>模式</label><select name="mode"><option value="homework">刷作业</option><option value="time">刷时长</option></select><div class="form-row"><div><label>正确率下限</label><input name="accuracy_min" type="number" min="0" max="100" value="100"></div><div><label>正确率上限</label><input name="accuracy_max" type="number" min="0" max="100" value="100"></div></div><div class="form-row"><div><label>总时长（分钟）</label><input name="total_minutes" type="number" min="1" value="60"></div><div><label>随机浮动（分钟）</label><input name="random_range" type="number" min="0" value="5"></div></div><p class="muted">Worker 版本通过 Cron 分步执行任务，不使用本地线程并发。</p></div><button style="width:100%;margin-top:16px">开始任务</button></form>`, user);
}

export function renderTaskList(user: User, tasks: Task[]): string {
  const items = tasks.slice().reverse().map((task) => `<tr><td>${escapeHtml(task.courseName)}</td><td>${escapeHtml(task.accountUsername)}</td><td>${escapeHtml(task.mode)}</td><td>${escapeHtml(task.status)}</td><td><a href="/tasks/${escapeHtml(task.id)}">查看</a></td></tr>`).join('');
  return page('任务列表', `<div class="card"><h2>任务列表</h2><table><thead><tr><th>课程</th><th>账号</th><th>模式</th><th>状态</th><th>操作</th></tr></thead><tbody>${items || '<tr><td colspan="5" class="muted">暂无任务</td></tr>'}</tbody></table></div>`, user);
}

export function renderTaskDetail(user: User, task: Task): string {
  const logs = task.logs.map((item) => `<div>[${new Date(item.timestamp * 1000).toLocaleString()}] ${escapeHtml(item.level)} - ${escapeHtml(item.message)}</div>`).join('');
  const stopForm = task.status === 'pending' || task.status === 'running' ? `<form method="post" action="/tasks/${escapeHtml(task.id)}/stop"><button class="danger">停止任务</button></form>` : '';
  return page('任务详情', `<div class="card"><h2>${escapeHtml(task.courseName)}</h2><p>状态：<strong>${escapeHtml(task.status)}</strong> / 模式：${escapeHtml(task.mode)}</p><h3>结果</h3><pre>${escapeHtml(JSON.stringify(task.result, null, 2))}</pre>${stopForm}<h3>日志</h3><div class="logs">${logs || '暂无日志'}</div></div>`, user);
}

export function renderAdminUsers(user: User, users: User[], message?: string): string {
  const rows = users.map((item) => `<tr><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.role)}</td><td><form method="post" action="/admin/users/delete"><input type="hidden" name="username" value="${escapeHtml(item.username)}"><button class="danger">删除</button></form></td></tr>`).join('');
  return page('用户管理', `${flash(message, 'danger')}<div class="card"><h2>创建用户</h2><form method="post" action="/admin/users/add"><div class="form-row"><input name="username" placeholder="用户名" required><input name="password" placeholder="密码" type="password" required></div><select name="role"><option value="user">普通用户</option><option value="admin">管理员</option></select><button>创建用户</button></form></div><div class="card"><h3>用户列表</h3><table><thead><tr><th>用户名</th><th>角色</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`, user);
}
