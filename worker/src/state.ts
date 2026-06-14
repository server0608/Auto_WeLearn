import { hashPassword, verifyPassword } from './crypto';
import type { Account, Env, Task, User } from './types';

type StatePayload = {
  users: User[];
  accounts: Record<string, Account[]>;
  tasks: Task[];
  sessionSecret?: string;
};

type StateRequest =
  | { action: 'init'; adminUsername: string; adminPassword: string; secretSource: string }
  | { action: 'getSessionSecret' }
  | { action: 'validateUser'; username: string; password: string }
  | { action: 'getUser'; username: string }
  | { action: 'addUser'; username: string; password: string; role: 'admin' | 'user' }
  | { action: 'listUsers' }
  | { action: 'deleteUser'; username: string }
  | { action: 'listAccounts'; owner: string }
  | { action: 'addAccount'; owner: string; account: Account }
  | { action: 'deleteAccount'; owner: string; accountUsername: string }
  | { action: 'getAccount'; owner: string; accountUsername: string }
  | { action: 'listTasks'; owner: string }
  | { action: 'listRunnableTasks' }
  | { action: 'getTask'; taskId: string }
  | { action: 'putTask'; task: Task }
  | { action: 'stopTask'; taskId: string; owner: string };

const STORAGE_KEY = 'state';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export class WeLearnState {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const body = await request.json<StateRequest>();
    const payload = await this.load();

    switch (body.action) {
      case 'init': {
        if (!payload.sessionSecret) {
          payload.sessionSecret = body.secretSource === 'change-me-random-string'
            ? `${crypto.randomUUID()}:${Date.now()}`
            : body.secretSource;
        }
        if (payload.users.length === 0) {
          payload.users.push({
            username: body.adminUsername,
            passwordHash: await hashPassword(body.adminPassword),
            role: 'admin',
          });
          await this.save(payload);
        }
        return json({ ok: true });
      }
      case 'getSessionSecret': {
        if (!payload.sessionSecret) {
          payload.sessionSecret = `${crypto.randomUUID()}:${Date.now()}`;
          await this.save(payload);
        }
        return json({ secret: payload.sessionSecret });
      }
      case 'validateUser': {
        const user = payload.users.find((item) => item.username === body.username);
        if (!user || !(await verifyPassword(body.password, user.passwordHash))) return json({ user: null });
        return json({ user });
      }
      case 'getUser': {
        return json({ user: payload.users.find((item) => item.username === body.username) ?? null });
      }
      case 'addUser': {
        if (!body.username.trim() || !body.password) return json({ ok: false, message: '用户名和密码不能为空' }, 400);
        if (payload.users.some((item) => item.username === body.username)) return json({ ok: false, message: '用户已存在' }, 409);
        payload.users.push({ username: body.username, passwordHash: await hashPassword(body.password), role: body.role });
        payload.accounts[body.username] = [];
        await this.save(payload);
        return json({ ok: true });
      }
      case 'listUsers': {
        return json({ users: payload.users });
      }
      case 'deleteUser': {
        const target = payload.users.find((item) => item.username === body.username);
        if (!target) return json({ ok: false, message: '用户不存在' }, 404);
        if (target.role === 'admin' && payload.users.filter((item) => item.role === 'admin').length <= 1) {
          return json({ ok: false, message: '至少保留一个管理员' }, 400);
        }
        payload.users = payload.users.filter((item) => item.username !== body.username);
        delete payload.accounts[body.username];
        payload.tasks = payload.tasks.filter((task) => task.owner !== body.username);
        await this.save(payload);
        return json({ ok: true });
      }
      case 'listAccounts': {
        return json({ accounts: payload.accounts[body.owner] ?? [] });
      }
      case 'addAccount': {
        const accounts = payload.accounts[body.owner] ?? [];
        if (accounts.some((account) => account.username === body.account.username)) return json({ ok: false, message: '账号已存在' }, 409);
        payload.accounts[body.owner] = [...accounts, body.account];
        await this.save(payload);
        return json({ ok: true });
      }
      case 'deleteAccount': {
        payload.accounts[body.owner] = (payload.accounts[body.owner] ?? []).filter((account) => account.username !== body.accountUsername);
        await this.save(payload);
        return json({ ok: true });
      }
      case 'getAccount': {
        return json({ account: (payload.accounts[body.owner] ?? []).find((account) => account.username === body.accountUsername) ?? null });
      }
      case 'listTasks': {
        return json({ tasks: payload.tasks.filter((task) => task.owner === body.owner) });
      }
      case 'listRunnableTasks': {
        return json({ tasks: payload.tasks.filter((task) => task.status === 'pending' || task.status === 'running') });
      }
      case 'getTask': {
        return json({ task: payload.tasks.find((task) => task.id === body.taskId) ?? null });
      }
      case 'putTask': {
        const index = payload.tasks.findIndex((task) => task.id === body.task.id);
        if (index >= 0) payload.tasks[index] = body.task;
        else payload.tasks.push(body.task);
        await this.save(payload);
        return json({ ok: true });
      }
      case 'stopTask': {
        const task = payload.tasks.find((item) => item.id === body.taskId && item.owner === body.owner);
        if (!task) return json({ ok: false, message: '任务不存在' }, 404);
        task.status = 'stopped';
        task.updatedAt = Date.now();
        task.logs.push({ level: 'warning', message: '收到停止指令', timestamp: Date.now() / 1000 });
        await this.save(payload);
        return json({ ok: true });
      }
    }
  }

  private async load(): Promise<StatePayload> {
    return (await this.state.storage.get<StatePayload>(STORAGE_KEY)) ?? { users: [], accounts: {}, tasks: [] };
  }

  private async save(payload: StatePayload): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, payload);
  }
}

export class StateClient {
  private stub: DurableObjectStub;

  constructor(env: Env) {
    const id = env.WELEARN_STATE.idFromName('global');
    this.stub = env.WELEARN_STATE.get(id);
  }

  async request<T>(body: StateRequest): Promise<T> {
    const response = await this.stub.fetch('https://state.local/', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json<T>();
  }
}
