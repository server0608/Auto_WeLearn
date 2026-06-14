import { WeLearnClient } from './api';
import { clearSessionCookie, createSessionToken, getSessionFromRequest, makeSessionCookie, parseSessionToken } from './auth';
import {
  renderAdminUsers,
  renderCourses,
  renderDashboard,
  renderLoginPage,
  renderRegisterPage,
  renderTaskDetail,
  renderTaskList,
  renderUnits,
} from './html';
import { StateClient, WeLearnState } from './state';
import { runTaskStep } from './tasks';
import type { Account, Env, Task, User } from './types';

export { WeLearnState };

type StateResponse<T> = T & { ok?: boolean; message?: string };

function html(body: string, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(body, { status, headers });
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function safeInt(value: string | File | null, fallback: number, min?: number, max?: number): number {
  let parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) parsed = fallback;
  if (min !== undefined) parsed = Math.max(min, parsed);
  if (max !== undefined) parsed = Math.min(max, parsed);
  return parsed;
}

function adminUsername(env: Env): string {
  return env.ADMIN_USERNAME?.trim() || 'admin';
}

function adminPassword(env: Env): string {
  return env.ADMIN_PASSWORD || 'admin123';
}

async function initState(state: StateClient, env: Env): Promise<void> {
  await state.request({ action: 'init', adminUsername: adminUsername(env), adminPassword: adminPassword(env), secretSource: env.SECRET_KEY });
}

async function sessionSecret(state: StateClient): Promise<string> {
  const response = await state.request<{ secret: string }>({ action: 'getSessionSecret' });
  return response.secret;
}

async function currentUser(request: Request, state: StateClient, secret: string): Promise<User | null> {
  const token = getSessionFromRequest(request);
  if (!token) return null;

  const username = await parseSessionToken(token, secret);
  if (!username) return null;

  const response = await state.request<{ user: User | null }>({ action: 'getUser', username });
  return response.user;
}

async function requireUser(request: Request, state: StateClient, secret: string): Promise<User | Response> {
  const user = await currentUser(request, state, secret);
  return user ?? html(renderLoginPage('请先登录', 'warning'), 401);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const state = new StateClient(env);
    await initState(state, env);
    const secret = await sessionSecret(state);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/' && method === 'GET') return redirect('/dashboard');
    if (path === '/login' && method === 'GET') return html(renderLoginPage());
    if (path === '/register' && method === 'GET') return html(renderRegisterPage());

    if (path === '/login' && method === 'POST') {
      const form = await request.formData();
      const username = String(form.get('username') ?? '').trim();
      const password = String(form.get('password') ?? '');
      const response = await state.request<{ user: User | null }>({ action: 'validateUser', username, password });
      if (!response.user) return html(renderLoginPage('用户名或密码错误', 'danger'), 401);

        const token = await createSessionToken(response.user.username, secret);
      return redirect('/dashboard', [makeSessionCookie(token)]);
    }

    if (path === '/logout' && method === 'POST') return redirect('/login', [clearSessionCookie()]);

    if (path === '/register' && method === 'POST') {
      const form = await request.formData();
      const username = String(form.get('username') ?? '').trim();
      const password = String(form.get('password') ?? '');
      const confirm = String(form.get('confirm') ?? '');
      if (!username || !password) return html(renderRegisterPage('用户名和密码不能为空'), 400);
      if (password !== confirm) return html(renderRegisterPage('两次输入的密码不一致'), 400);

      const response = await state.request<StateResponse<unknown>>({ action: 'addUser', username, password, role: 'user' });
      if (!response.ok) return html(renderRegisterPage(response.message || '注册失败'), 400);
      return redirect('/login');
    }

    const userOrResponse = await requireUser(request, state, secret);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    if (path === '/dashboard' && method === 'GET') {
      const [{ accounts }, { tasks }] = await Promise.all([
        state.request<{ accounts: Account[] }>({ action: 'listAccounts', owner: user.username }),
        state.request<{ tasks: Task[] }>({ action: 'listTasks', owner: user.username }),
      ]);
      return html(renderDashboard(user, accounts, tasks));
    }

    if (path === '/accounts/add' && method === 'POST') {
      const form = await request.formData();
      const account: Account = {
        username: String(form.get('username') ?? '').trim(),
        password: String(form.get('password') ?? ''),
        nickname: String(form.get('nickname') ?? '').trim(),
      };
      if (account.username && account.password) {
        await state.request({ action: 'addAccount', owner: user.username, account });
      }
      return redirect('/dashboard');
    }

    if (path === '/accounts/delete' && method === 'POST') {
      const form = await request.formData();
      await state.request({ action: 'deleteAccount', owner: user.username, accountUsername: String(form.get('username') ?? '') });
      return redirect('/dashboard');
    }

    if (path === '/courses' && method === 'GET') {
      const accountUsername = url.searchParams.get('account') ?? '';
      const { account } = await state.request<{ account: Account | null }>({ action: 'getAccount', owner: user.username, accountUsername });
      if (!account) return html(renderDashboard(user, [], [], '账号不存在', 'danger'), 404);

      const client = new WeLearnClient();
      const [loggedIn, loginMessage] = await client.login(account.username, account.password);
      if (!loggedIn) return html(renderCourses(user, account, [], `登录失败: ${loginMessage}`), 400);

      const [ok, courses, message] = await client.getCourses();
      return html(renderCourses(user, account, ok ? courses : [], ok ? undefined : message));
    }

    if (path === '/units' && method === 'GET') {
      const accountUsername = url.searchParams.get('account') ?? '';
      const cid = url.searchParams.get('cid') ?? '';
      const courseName = url.searchParams.get('course_name') ?? '';
      const { account } = await state.request<{ account: Account | null }>({ action: 'getAccount', owner: user.username, accountUsername });
      if (!account) return html('账号不存在', 404);

      const client = new WeLearnClient();
      const [loggedIn, loginMessage] = await client.login(account.username, account.password);
      if (!loggedIn) return html(`登录失败: ${loginMessage}`, 400);

      const [ok, data, message] = await client.getCourseInfo(cid);
      if (!ok || !data) return html(`获取单元失败: ${message}`, 400);
      return html(renderUnits(user, account, courseName, cid, data.uid, data.classid, data.units));
    }

    if (path === '/tasks/start' && method === 'POST') {
      const form = await request.formData();
      const units = form.getAll('units').map((item) => Number.parseInt(String(item), 10)).filter((item) => !Number.isNaN(item));
      if (units.length === 0) return redirect('/dashboard');

      const now = Date.now();
      const task: Task = {
        id: crypto.randomUUID().slice(0, 8),
        owner: user.username,
        accountUsername: String(form.get('account_username') ?? ''),
        cid: String(form.get('cid') ?? ''),
        courseName: String(form.get('course_name') ?? ''),
        uid: String(form.get('uid') ?? ''),
        classid: String(form.get('classid') ?? ''),
        units,
        mode: String(form.get('mode') ?? 'homework') === 'time' ? 'time' : 'homework',
        accuracyRange: [safeInt(form.get('accuracy_min'), 100, 0, 100), safeInt(form.get('accuracy_max'), 100, 0, 100)],
        totalMinutes: safeInt(form.get('total_minutes'), 60, 1),
        randomRange: safeInt(form.get('random_range'), 5, 0),
        maxConcurrent: 1,
        status: 'pending',
        result: {},
        logs: [{ level: 'info', message: '任务已创建，Cron 将自动推进', timestamp: now / 1000 }],
        createdAt: now,
        updatedAt: now,
      };
      await state.request({ action: 'putTask', task });
      return redirect(`/tasks/${task.id}`);
    }

    if (path === '/tasks' && method === 'GET') {
      const { tasks } = await state.request<{ tasks: Task[] }>({ action: 'listTasks', owner: user.username });
      return html(renderTaskList(user, tasks));
    }

    const taskMatch = path.match(/^\/tasks\/([^/]+)$/);
    if (taskMatch && method === 'GET') {
      const { task } = await state.request<{ task: Task | null }>({ action: 'getTask', taskId: taskMatch[1] });
      if (!task || task.owner !== user.username) return html('任务不存在', 404);
      return html(renderTaskDetail(user, task));
    }

    const stopMatch = path.match(/^\/tasks\/([^/]+)\/stop$/);
    if (stopMatch && method === 'POST') {
      await state.request({ action: 'stopTask', taskId: stopMatch[1], owner: user.username });
      return redirect(`/tasks/${stopMatch[1]}`);
    }

    if (path === '/admin/users' && method === 'GET') {
      if (user.role !== 'admin') return redirect('/dashboard');
      const { users } = await state.request<{ users: User[] }>({ action: 'listUsers' });
      return html(renderAdminUsers(user, users));
    }

    if (path === '/admin/users/add' && method === 'POST') {
      if (user.role !== 'admin') return redirect('/dashboard');
      const form = await request.formData();
      await state.request({
        action: 'addUser',
        username: String(form.get('username') ?? '').trim(),
        password: String(form.get('password') ?? ''),
        role: String(form.get('role') ?? 'user') === 'admin' ? 'admin' : 'user',
      });
      return redirect('/admin/users');
    }

    if (path === '/admin/users/delete' && method === 'POST') {
      if (user.role !== 'admin') return redirect('/dashboard');
      const form = await request.formData();
      await state.request({ action: 'deleteUser', username: String(form.get('username') ?? '') });
      return redirect('/admin/users');
    }

    return html('Not Found', 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledTasks(env));
  },
};

async function runScheduledTasks(env: Env): Promise<void> {
  const state = new StateClient(env);
  await initState(state, env);
  const { tasks } = await state.request<{ tasks: Task[] }>({ action: 'listRunnableTasks' });

  for (const task of tasks) {
    const { accounts } = await state.request<{ accounts: Account[] }>({ action: 'listAccounts', owner: task.owner });
    const nextTask = await runTaskStep(task, accounts);
    const { task: latest } = await state.request<{ task: Task | null }>({ action: 'getTask', taskId: task.id });
    if (latest?.status === 'stopped') continue;
    await state.request({ action: 'putTask', task: nextTask });
  }
}
