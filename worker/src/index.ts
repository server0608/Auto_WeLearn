import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KVStore } from './kv/store';
import { WeLearnClient } from './kv/welearn';
import type { StudyTask } from './types';

interface Env {
  WELEARN_KV: KVNamespace;
  WELEARN_ADMIN_PASSWORD?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.use('*', async (c, next) => {
  await kv(c.env).ensureAdmin(c.env.WELEARN_ADMIN_PASSWORD);
  await next();
});

const kv = (env: Env) => new KVStore(env.WELEARN_KV);

function renderTemplate(title: string, content: string, user?: { username: string; role: string }): Response {
  const nav = user ? `<a href="/dashboard">${user.username}</a> | <form action="/logout" method="post" style="display:inline"><button type="submit">退出</button></form>` : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - Auto WeLearn</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Microsoft YaHei UI",sans-serif;background:#f4efe6;color:#18212f;min-height:100vh}
nav{background:#f8f4eb;border-bottom:1px solid #e3d8c6;padding:12px 24px;display:flex;justify-content:space-between;align-items:center}
nav a{color:#1d6b50;text-decoration:none;margin:0 12px;font-weight:600}
nav form{display:inline}
nav button{background:#1d6b50;color:white;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600}
nav button:hover{background:#175740}
.container{max-width:1100px;margin:24px auto;padding:0 20px}
.card{background:#fffaf0;border:1px solid #e3d8c6;border-radius:18px;padding:24px;margin-bottom:20px}
h1{color:#18212f;font-size:26px;margin-bottom:16px}
h2{color:#6c4f2a;font-size:18px;margin:16px 0 12px}
label{display:block;color:#8f6f49;font-weight:700;margin:12px 0 6px}
input,select{width:100%;padding:10px 12px;border:1px solid #decfb7;border-radius:12px;font-size:14px;background:#fffdf8;color:#18212f}
input:focus,select:focus{outline:none;border-color:#1d6b50}
button{background:#1d6b50;color:white;border:none;padding:10px 20px;border-radius:12px;font-weight:600;cursor:pointer;font-size:14px}
button:hover{background:#175740}
button:disabled{background:#c8c0b5;color:#6f675b;cursor:not-allowed}
.btn-danger{background:#c0392b}
.btn-danger:hover{background:#a93226}
.btn-secondary{background:#6c4f2a}
.btn-secondary:hover{background:#5a3f22}
.alert{padding:12px 16px;border-radius:12px;margin-bottom:16px;font-size:14px}
.alert-success{background:#d4edda;color:#155724;border:1px solid #c3e6cb}
.alert-danger{background:#f8d7da;color:#721c24;border:1px solid #f5c6cb}
.alert-warning{background:#fff3cd;color:#856404;border:1px solid #ffeeba}
.alert-info{background:#d1ecf1;color:#0c5460;border:1px solid #bee5eb}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:12px;text-align:left;border-bottom:1px solid #e4d9c8}
th{background:#f7efe3;color:#6c4f2a;font-weight:700}
tr:hover{background:#faf4ea}
.badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600}
.badge-success{background:#d4edda;color:#155724}
.badge-warning{background:#fff3cd;color:#856404}
.badge-danger{background:#f8d7da;color:#721c24}
.badge-info{background:#d1ecf1;color:#0c5460}
.logs{background:#18212f;color:#f4efe6;padding:16px;border-radius:12px;font-family:Consolas,monospace;font-size:13px;max-height:300px;overflow-y:auto;white-space:pre-wrap}
.flex{display:flex;gap:12px;flex-wrap:wrap}
.flex>*{flex:1;min-width:200px}
.text-center{text-align:center}
.mt-4{margin-top:16px}
.mb-4{margin-bottom:16px}
small{color:#6d6253;font-size:12px}
</style>
</head>
<body>
<nav>${nav}</nav>
<div class="container">${content}</div>
</body>
</html>`;

  return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function getSessionCookie(c: any): string | undefined {
  return getCookie(c, 'session');
}

function sessionCookie(sessionId: string): string {
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}

function expiredSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

async function getCurrentUser(c: any) {
  const session = getSessionCookie(c);
  if (!session) return null;
  const store = kv(c.env);
  return await store.getSessionUser(session);
}

function safeInt(value: string, defaultVal: number, min?: number, max?: number): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultVal;
  let result = parsed;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    pending: '<span class="badge badge-info">等待中</span>',
    running: '<span class="badge badge-warning">运行中</span>',
    completed: '<span class="badge badge-success">已完成</span>',
    failed: '<span class="badge badge-danger">失败</span>',
    stopped: '<span class="badge badge-danger">已停止</span>',
  };
  return map[status] || status;
}

// ==================== ROUTES ====================

// Index
app.get('/', async (c) => {
  const user = await getCurrentUser(c);
  if (user) return redirect('/dashboard');
  return redirect('/login');
});

// Login
app.get('/login', async (c) => {
  const user = await getCurrentUser(c);
  if (user) return redirect('/dashboard');

  const content = `
    <div class="card">
      <h1>登录</h1>
      <form method="post" action="/login">
        <label>用户名</label>
        <input type="text" name="username" required placeholder="用户名">
        <label>密码</label>
        <input type="password" name="password" required placeholder="密码">
        <button type="submit" class="mt-4">登录</button>
      </form>
      <p class="mt-4 text-center"><a href="/register">没有账号？去注册</a></p>
    </div>`;
  return renderTemplate('登录', content);
});

app.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const nextUrl = new URL(c.req.url).searchParams.get('next') || '/dashboard';

  const store = kv(c.env);
  const user = await store.validateCredentials(username, password);

  if (user) {
    const sessionId = await store.createSession(user.username);
    return redirect(nextUrl, sessionCookie(sessionId));
  }

  const content = `
    <div class="card">
      <h1>登录</h1>
      <div class="alert alert-danger">用户名或密码错误</div>
      <form method="post" action="/login">
        <label>用户名</label>
        <input type="text" name="username" required placeholder="用户名">
        <label>密码</label>
        <input type="password" name="password" required placeholder="密码">
        <button type="submit" class="mt-4">登录</button>
      </form>
      <p class="mt-4 text-center"><a href="/register">没有账号？去注册</a></p>
    </div>`;
  return renderTemplate('登录', content);
});

// Register
app.get('/register', async (c) => {
  const user = await getCurrentUser(c);
  if (user) return redirect('/dashboard');

  const content = `
    <div class="card">
      <h1>注册</h1>
      <form method="post" action="/register">
        <label>用户名</label>
        <input type="text" name="username" required placeholder="用户名">
        <label>密码</label>
        <input type="password" name="password" required placeholder="密码">
        <label>确认密码</label>
        <input type="password" name="confirm" required placeholder="确认密码">
        <button type="submit" class="mt-4">注册</button>
      </form>
      <p class="mt-4 text-center"><a href="/login">已有账号？去登录</a></p>
    </div>`;
  return renderTemplate('注册', content);
});

app.post('/register', async (c) => {
  const body = await c.req.parseBody();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const confirm = String(body.confirm || '');

  if (!username || !password) {
    const content = `<div class="card"><div class="alert alert-danger">用户名和密码不能为空</div></div>`;
    return renderTemplate('注册', content);
  }

  if (password !== confirm) {
    const content = `<div class="card"><div class="alert alert-danger">两次输入的密码不一致</div></div>`;
    return renderTemplate('注册', content);
  }

  const store = kv(c.env);
  const result = await store.addUser(username, password, 'user');

  if (result.ok) {
    return redirect('/login');
  }

  const content = `
    <div class="card">
      <h1>注册</h1>
      <div class="alert alert-danger">${result.msg}</div>
      <form method="post" action="/register">
        <label>用户名</label>
        <input type="text" name="username" required placeholder="用户名">
        <label>密码</label>
        <input type="password" name="password" required placeholder="密码">
        <label>确认密码</label>
        <input type="password" name="confirm" required placeholder="确认密码">
        <button type="submit" class="mt-4">注册</button>
      </form>
    </div>`;
  return renderTemplate('注册', content);
});

// Logout
app.post('/logout', async (c) => {
  const session = getSessionCookie(c);
  if (session) {
    await kv(c.env).deleteSession(session);
  }
  return redirect('/login', expiredSessionCookie());
});

// Dashboard
app.get('/dashboard', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const store = kv(c.env);
  const accounts = await store.getAccounts(user.username);
  const tasks = await store.listTasks(user.username);

  const accountsHtml = accounts.length === 0
    ? '<p>暂无账号，添加下方添加</p>'
    : `<table><tr><th>用户名</th><th>昵称</th><th>状态</th><th>操作</th></tr>
      ${accounts.map(acc => `
        <tr>
          <td>${acc.username}</td>
          <td>${acc.nickname || '-'}</td>
          <td>${acc.status}</td>
          <td>
            <a href="/accounts/${acc.username}/courses"><button>课程</button></a>
            <form method="post" action="/accounts/${acc.username}/delete" style="display:inline">
              <button type="submit" class="btn-danger">删除</button>
            </form>
          </td>
        </tr>`).join('')}</table>`;

  const tasksHtml = tasks.length === 0
    ? '<p>暂无任务</p>'
    : `<table><tr><th>任务ID</th><th>课程</th><th>模式</th><th>状态</th><th>操作</th></tr>
      ${tasks.map(task => `
        <tr>
          <td>${task.id}</td>
          <td>${task.course_name}</td>
          <td>${task.mode === 'homework' ? '刷作业' : '刷时长'}</td>
          <td>${statusBadge(task.status)}</td>
          <td><a href="/tasks/${task.id}"><button>详情</button></a></td>
        </tr>`).join('')}</table>`;

  const content = `
    <div class="card">
      <h1>控制台</h1>
      <p>欢迎，${user.username} (${user.role === 'admin' ? '管理员' : '普通用户'})</p>
    </div>
    <div class="card">
      <h2>添加账号</h2>
      <form method="post" action="/accounts" class="flex">
        <div><label>用户名</label><input name="username" required placeholder="用户名"></div>
        <div><label>密码</label><input name="password" type="password" required placeholder="密码"></div>
        <div><label>昵称</label><input name="nickname" placeholder="昵称（可选）"></div>
        <div style="display:flex;align-items:flex-end"><button type="submit">添加</button></div>
      </form>
    </div>
    <div class="card">
      <h2>账号列表</h2>
      ${accountsHtml}
    </div>
    <div class="card">
      <h2>我的任务</h2>
      ${tasksHtml}
    </div>`;

  return renderTemplate('控制台', content, user);
});

// Account courses
app.get('/accounts/:username/courses', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const username = c.req.param('username');
  const store = kv(c.env);
  const accounts = await store.getAccounts(user.username);
  const account = accounts.find(a => a.username === username);

  if (!account) return renderTemplate('错误', '<div class="alert alert-danger">未找到该账号</div>', user);

  const client = new WeLearnClient();
  const loginRes = await client.login(account.username, account.password);

  if (!loginRes.ok) {
    return renderTemplate('课程', `<div class="alert alert-danger">登录失败: ${loginRes.msg}</div>`, user);
  }

  const coursesRes = await client.getCourses();

  if (!coursesRes.ok) {
    return renderTemplate('课程', `<div class="alert alert-danger">获取课程失败: ${coursesRes.msg}</div>`, user);
  }

  const coursesHtml = coursesRes.courses.length === 0
    ? '<p>没有找到课程</p>'
    : coursesRes.courses.map(course =>
      `<div style="margin:12px 0;padding:12px;background:#faf4ea;border-radius:12px">
        <strong>${course.name}</strong> (进度: ${course.per}%)
        <a href="/accounts/${username}/courses/${course.cid}/units?course_name=${encodeURIComponent(course.name)}"><button>选择单元</button></a>
      </div>`).join('');

  const content = `
    <div class="card">
      <h1>课程列表 - ${account.username}</h1>
      ${coursesHtml}
    </div>`;

  return renderTemplate('课程列表', content, user);
});

// Account units
app.get('/accounts/:username/courses/:cid/units', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const username = c.req.param('username');
  const cid = c.req.param('cid');
  const courseName = new URL(c.req.url).searchParams.get('course_name') || '';

  const store = kv(c.env);
  const accounts = await store.getAccounts(user.username);
  const account = accounts.find(a => a.username === username);

  if (!account) return renderTemplate('错误', '<div class="alert alert-danger">未找到该账号</div>', user);

  const client = new WeLearnClient();
  const loginRes = await client.login(account.username, account.password);

  if (!loginRes.ok) {
    return renderTemplate('单元', `<div class="alert alert-danger">登录失败: ${loginRes.msg}</div>`, user);
  }

  const infoRes = await client.getCourseInfo(cid);

  if (!infoRes.ok || !infoRes.data) {
    return renderTemplate('单元', `<div class="alert alert-danger">获取单元失败: ${infoRes.msg}</div>`, user);
  }

  const { uid, classid, units } = infoRes.data;

  const unitsHtml = units.map((unit, i) =>
    `<label style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <input type="checkbox" name="units" value="${i}" checked> 单元 ${i + 1}: ${unit.name || '未命名'}
    </label>`).join('');

  const content = `
    <div class="card">
      <h1>选择单元 - ${courseName}</h1>
      <form method="post" action="/tasks/start">
        <input type="hidden" name="account_username" value="${username}">
        <input type="hidden" name="course_name" value="${courseName}">
        <input type="hidden" name="cid" value="${cid}">
        <input type="hidden" name="uid" value="${uid}">
        <input type="hidden" name="classid" value="${classid}">
        <div style="max-height:300px;overflow-y:auto;border:1px solid #decfb7;border-radius:12px;padding:12px;margin-bottom:16px">
          ${unitsHtml}
        </div>
        <div class="flex mb-4">
          <div>
            <label>模式</label>
            <select name="mode" id="mode-select">
              <option value="homework">刷作业</option>
              <option value="time">刷时长</option>
            </select>
          </div>
        </div>
        <div id="homework-settings" class="flex mb-4">
          <div>
            <label>正确率</label>
            <div style="display:flex;gap:12px">
              <input type="number" name="accuracy_min" value="100" min="0" max="100" style="width:100px"> ~
              <input type="number" name="accuracy_max" value="100" min="0" max="100" style="width:100px"> %
            </div>
          </div>
        </div>
        <div id="time-settings" class="flex mb-4" style="display:none">
          <div>
            <label>总时长 (分钟)</label>
            <input type="number" name="total_minutes" value="60" min="1">
          </div>
          <div>
            <label>随机扰动 (分钟)</label>
            <input type="number" name="random_range" value="5" min="0">
          </div>
          <div>
            <label>并发数</label>
            <input type="number" name="max_concurrent" value="5" min="1">
          </div>
        </div>
        <button type="submit">开始任务</button>
      </form>
    </div>
    <script>
      document.getElementById('mode-select').addEventListener('change', function() {
        document.getElementById('homework-settings').style.display = this.value === 'homework' ? 'flex' : 'none';
        document.getElementById('time-settings').style.display = this.value === 'time' ? 'flex' : 'none';
      });
    </script>`;

  return renderTemplate('选择单元', content, user);
});

// Start task
app.post('/tasks/start', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const body = await c.req.parseBody();
  const accountUsername = String(body.account_username || '');
  const courseName = String(body.course_name || '');
  const cid = String(body.cid || '');
  const uid = String(body.uid || '');
  const classid = String(body.classid || '');
  const mode = String(body.mode || 'homework') === 'time' ? 'time' : 'homework';
  const unitsRaw = Array.isArray(body.units) ? body.units : [body.units].filter(Boolean);
  const units = unitsRaw.map(u => parseInt(String(u), 10)).filter(n => !isNaN(n));

  if (units.length === 0) {
    return renderTemplate('错误', '<div class="alert alert-danger">请至少选择一个单元</div>', user);
  }

  const accuracyMin = safeInt(String(body.accuracy_min || '100'), 100, 0, 100);
  const rawAccuracyMax = safeInt(String(body.accuracy_max || '100'), 100, 0, 100);
  const accuracyMax = Math.max(accuracyMin, rawAccuracyMax);
  const totalMinutes = safeInt(String(body.total_minutes || '60'), 60, 1);
  const randomRange = safeInt(String(body.random_range || '5'), 5, 0);
  const maxConcurrent = safeInt(String(body.max_concurrent || '5'), 5, 1);

  const store = kv(c.env);
  const accounts = await store.getAccounts(user.username);
  const account = accounts.find(a => a.username === accountUsername);

  if (!account) return renderTemplate('错误', '<div class="alert alert-danger">未找到指定账号</div>', user);

  const taskId = Math.random().toString(36).substring(2, 10);

  const task: StudyTask = {
    id: taskId,
    owner: user.username,
    account,
    cid,
    course_name: courseName,
    uid,
    classid,
    units,
    mode,
    accuracy_range: [accuracyMin, accuracyMax],
    total_minutes: totalMinutes,
    random_range: randomRange,
    max_concurrent: maxConcurrent,
    status: 'pending',
    result: {},
    logs: [],
  };

  await store.createTask(task);

  const client = new WeLearnClient();
  c.executionCtx.waitUntil(runTask(task, client, store));

  return redirect(`/tasks/${taskId}`);
});

async function runTask(task: StudyTask, client: WeLearnClient, store: KVStore): Promise<void> {
  task.status = 'running';
  task.logs.push({ level: 'info', message: `登录 WeLearn 账号 ${task.account.username}...`, timestamp: Date.now() / 1000 });
  await store.updateTask(task.id, task);

  const loginRes = await client.login(task.account.username, task.account.password);

  if (!loginRes.ok) {
    task.status = 'failed';
    task.logs.push({ level: 'danger', message: `登录失败: ${loginRes.msg}`, timestamp: Date.now() / 1000 });
    await store.updateTask(task.id, task);
    return;
  }

  task.logs.push({ level: 'success', message: '登录成功，开始处理课程', timestamp: Date.now() / 1000 });
  await store.updateTask(task.id, task);

  try {
    if (task.mode === 'time') {
      await runTimeMode(task, client, store);
    } else {
      await runHomeworkMode(task, client, store);
    }

    if (task.status === 'running') {
      task.status = 'completed';
      task.logs.push({ level: 'success', message: '任务完成', timestamp: Date.now() / 1000 });
    }
  } catch (e) {
    task.status = 'failed';
    task.logs.push({ level: 'danger', message: `任务异常: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() / 1000 });
  }

  await store.updateTask(task.id, task);
}

async function runHomeworkMode(task: StudyTask, client: WeLearnClient, store: KVStore): Promise<void> {
  let w1s = 0, w1f = 0, w2s = 0, w2f = 0;

  for (const unitIdx of task.units) {
    if (await shouldStop(task, store)) return;

    task.logs.push({ level: 'info', message: `开始单元 ${unitIdx + 1}`, timestamp: Date.now() / 1000 });
    await store.updateTask(task.id, task);

    const leavesRes = await client.getScoLeaves(task.cid, task.uid, task.classid, unitIdx);

    if (!leavesRes.ok) {
      task.logs.push({ level: 'danger', message: `获取单元失败: ${leavesRes.msg}`, timestamp: Date.now() / 1000 });
      await store.updateTask(task.id, task);
      continue;
    }

    for (const chapter of leavesRes.leaves) {
      if (await shouldStop(task, store)) return;

      const ch = chapter as Record<string, unknown>;
      const name = String(ch.location || ch.id || '未知课程');

      if (ch.isvisible === 'false') {
        task.logs.push({ level: 'warning', message: `跳过隐藏课程: ${name}`, timestamp: Date.now() / 1000 });
        await store.updateTask(task.id, task);
        continue;
      }

      if (typeof ch.iscomplete === 'string' && ch.iscomplete.includes('未')) {
        const accuracy = task.accuracy_range[0] + Math.floor(Math.random() * (task.accuracy_range[1] - task.accuracy_range[0] + 1));
        const res = await client.submitCourseProgress(task.cid, task.uid, task.classid, String(ch.id), accuracy);

        w1s += res.w1s; w1f += res.w1f; w2s += res.w2s; w2f += res.w2f;

        task.logs.push({
          level: 'success',
          message: `[完成] ${name} - 正确率 ${accuracy}% (步骤1:${res.w1s ? '成功' : '失败'}, 步骤2:${res.w2s ? '成功' : '失败'})`,
          timestamp: Date.now() / 1000,
        });
      } else {
        task.logs.push({ level: 'info', message: `[已完成] ${name}`, timestamp: Date.now() / 1000 });
      }
      await store.updateTask(task.id, task);
    }
  }

  task.result = { way1_succeed: w1s, way1_failed: w1f, way2_succeed: w2s, way2_failed: w2f };
}

async function runTimeMode(task: StudyTask, client: WeLearnClient, store: KVStore): Promise<void> {
  const allChapters: Record<string, unknown>[] = [];

  for (const unitIdx of task.units) {
    if (await shouldStop(task, store)) return;

    const res = await client.getScoLeaves(task.cid, task.uid, task.classid, unitIdx);
    if (res.ok) {
      const visible = res.leaves.filter(ch => (ch as Record<string, unknown>).isvisible !== 'false');
      allChapters.push(...visible);
    }
  }

  if (allChapters.length === 0) {
    task.status = 'failed';
    task.logs.push({ level: 'danger', message: '没有可刷的课程', timestamp: Date.now() / 1000 });
    return;
  }

  const actualMinutes = task.total_minutes + Math.floor(Math.random() * (task.random_range * 2 + 1)) - task.random_range;
  const totalSeconds = Math.max(1, actualMinutes) * 60;
  const perCourseSeconds = Math.max(1, Math.floor(totalSeconds / allChapters.length));

  task.logs.push({
    level: 'info',
    message: `总课程 ${allChapters.length} 个，总时长 ${actualMinutes} 分钟，每课程 ${perCourseSeconds} 秒，并发 ${task.max_concurrent}`,
    timestamp: Date.now() / 1000,
  });
  await store.updateTask(task.id, task);

  let successCount = 0, failCount = 0;

  for (const chapter of allChapters) {
    if (await shouldStop(task, store)) return;

    const name = String(chapter.location || chapter.id || '课程');
    const learningTime = perCourseSeconds;

    task.logs.push({ level: 'info', message: `[开始] ${name} - ${learningTime}秒`, timestamp: Date.now() / 1000 });
    await store.updateTask(task.id, task);

    const ok = await client.simulateTime(task.cid, task.uid, String(chapter.id), learningTime);

    if (ok) {
      task.logs.push({ level: 'success', message: `[完成] ${name}`, timestamp: Date.now() / 1000 });
      successCount++;
    } else {
      task.logs.push({ level: 'danger', message: `[失败] ${name}`, timestamp: Date.now() / 1000 });
      failCount++;
    }
    await store.updateTask(task.id, task);
  }

  task.result = { way1_succeed: successCount, way1_failed: failCount, way2_succeed: successCount, way2_failed: failCount };
}

async function shouldStop(task: StudyTask, store: KVStore): Promise<boolean> {
  const latest = await store.getTask(task.id);
  if (latest?.status !== 'stopped') return false;
  task.status = 'stopped';
  task.logs.push({ level: 'warning', message: '任务已停止', timestamp: Date.now() / 1000 });
  await store.updateTask(task.id, task);
  return true;
}

// Task detail
app.get('/tasks/:task_id', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const taskId = c.req.param('task_id');
  const store = kv(c.env);
  const task = await store.getTask(taskId);

  if (!task || task.owner !== user.username) {
    return renderTemplate('错误', '<div class="alert alert-danger">任务不存在或无权限查看</div>', user);
  }

  const logsHtml = task.logs.length === 0
    ? '<p>暂无日志</p>'
    : task.logs.map(log => {
      const color = log.level === 'danger' ? '#f8d7da' : log.level === 'success' ? '#d4edda' : log.level === 'warning' ? '#fff3cd' : 'transparent';
      return `<div style="padding:4px 8px;background:${color};border-radius:4px;margin:4px 0">[${formatTimestamp(log.timestamp)}] ${log.message}</div>`;
    }).join('');

  const resultHtml = Object.keys(task.result).length === 0
    ? '<p>暂无结果</p>'
    : `<pre>${JSON.stringify(task.result, null, 2)}</pre>`;

  const content = `
    <div class="card">
      <h1>任务详情</h1>
      <p><strong>任务ID:</strong> ${task.id}</p>
      <p><strong>课程:</strong> ${task.course_name}</p>
      <p><strong>模式:</strong> ${task.mode === 'homework' ? '刷作业' : '刷时长'}</p>
      <p><strong>状态:</strong> ${statusBadge(task.status)}</p>
      ${task.status === 'running' || task.status === 'pending' ? `<form method="post" action="/tasks/${task.id}/stop"><button type="submit" class="btn-danger">停止任务</button></form>` : ''}
    </div>
    <div class="card">
      <h2>结果</h2>
      ${resultHtml}
    </div>
    <div class="card">
      <h2>日志</h2>
      <div class="logs">${logsHtml}</div>
    </div>`;

  return renderTemplate('任务详情', content, user);
});

// Stop task
app.post('/tasks/:task_id/stop', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const taskId = c.req.param('task_id');
  const store = kv(c.env);
  const task = await store.getTask(taskId);

  if (!task || task.owner !== user.username) {
    return renderTemplate('错误', '<div class="alert alert-danger">任务不存在或无权限操作</div>', user);
  }

  task.status = 'stopped';
  task.logs.push({ level: 'warning', message: '收到停止指令', timestamp: Date.now() / 1000 });
  await store.updateTask(taskId, task);

  return redirect(`/tasks/${taskId}`);
});

// Add account
app.post('/accounts', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const body = await c.req.parseBody();
  const username = String(body.username || '').trim();
  const password = String(body.password || '').trim();
  const nickname = String(body.nickname || '').trim();

  if (!username || !password) {
    return renderTemplate('错误', '<div class="alert alert-danger">账号和密码不能为空</div>', user);
  }

  const store = kv(c.env);
  const accounts = await store.getAccounts(user.username);

  if (accounts.some(a => a.username === username)) {
    return renderTemplate('错误', '<div class="alert alert-danger">该账号已存在</div>', user);
  }

  accounts.push({ username, password, nickname, status: '待处理', progress: '' });
  await store.saveAccounts(user.username, accounts);

  return redirect('/dashboard');
});

// Delete account
app.post('/accounts/:username/delete', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');

  const username = c.req.param('username');
  const store = kv(c.env);
  const accounts = await store.getAccounts(user.username);
  const filtered = accounts.filter(a => a.username !== username);

  if (filtered.length !== accounts.length) {
    await store.saveAccounts(user.username, filtered);
  }

  return redirect('/dashboard');
});

// Admin users
app.get('/admin/users', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return redirect('/login');
  if (user.role !== 'admin') return renderTemplate('权限不足', '<div class="alert alert-danger">需要管理员权限</div>', user);

  const store = kv(c.env);
  const users = await store.listUsers();

  const usersHtml = users.map(u => `
    <tr>
      <td>${u.username}</td>
      <td>${u.role === 'admin' ? '管理员' : '普通用户'}</td>
      <td>
        ${u.username !== user.username ? `<form method="post" action="/admin/users/${u.username}/delete" style="display:inline"><button type="submit" class="btn-danger">删除</button></form>` : '<span style="color:#999">当前用户</span>'}
      </td>
    </tr>`).join('');

  const content = `
    <div class="card">
      <h1>用户管理</h1>
    </div>
    <div class="card">
      <h2>创建用户</h2>
      <form method="post" action="/admin/users" class="flex">
        <div><label>用户名</label><input name="username" required placeholder="用户名"></div>
        <div><label>密码</label><input name="password" type="password" required placeholder="密码"></div>
        <div><label>角色</label>
          <select name="role">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div style="display:flex;align-items:flex-end"><button type="submit">创建</button></div>
      </form>
    </div>
    <div class="card">
      <h2>用户列表</h2>
      <table>
        <tr><th>用户名</th><th>角色</th><th>操作</th></tr>
        ${usersHtml}
      </table>
    </div>`;

  return renderTemplate('用户管理', content, user);
});

app.post('/admin/users', async (c) => {
  const user = await getCurrentUser(c);
  if (!user || user.role !== 'admin') return redirect('/login');

  const body = await c.req.parseBody();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const role = String(body.role || 'user') === 'admin' ? 'admin' : 'user';

  const store = kv(c.env);
  const result = await store.addUser(username, password, role);

  if (!result.ok) {
    return renderTemplate('用户管理', `<div class="alert alert-danger">${result.msg}</div>`, user);
  }

  return redirect('/admin/users');
});

app.post('/admin/users/:username/delete', async (c) => {
  const user = await getCurrentUser(c);
  if (!user || user.role !== 'admin') return redirect('/login');

  const username = c.req.param('username');

  if (username === user.username) {
    return renderTemplate('用户管理', '<div class="alert alert-danger">不能删除当前登录的管理员</div>', user);
  }

  const store = kv(c.env);
  await store.removeUser(username);

  return redirect('/admin/users');
});

// 404
app.notFound(() => renderTemplate('404', '<div class="card"><h1>404</h1><p>页面不存在</p></div>'));

export default app;
