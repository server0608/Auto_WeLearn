import type { AppUser, Account, StudyTask } from '../types';

const USERS_KEY = 'users';
const TASKS_KEY = 'tasks';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export class KVStore {
  constructor(private kv: KVNamespace) {}

  async getUsers(): Promise<Map<string, AppUser>> {
    const data = await this.kv.get(USERS_KEY, 'json');
    if (!data || typeof data !== 'object') return new Map();
    const users = data as Record<string, AppUser>;
    return new Map(Object.entries(users));
  }

  async saveUsers(users: Map<string, AppUser>): Promise<void> {
    const obj: Record<string, AppUser> = {};
    users.forEach((v, k) => obj[k] = v);
    await this.kv.put(USERS_KEY, JSON.stringify(obj));
  }

  async getUser(username: string): Promise<AppUser | undefined> {
    const users = await this.getUsers();
    return users.get(username);
  }

  async addUser(username: string, password: string, role: 'user' | 'admin' = 'user'): Promise<{ ok: boolean; msg: string }> {
    const users = await this.getUsers();
    if (users.has(username)) return { ok: false, msg: '用户已存在' };
    const password_hash = await hashPassword(password);
    users.set(username, { username, password_hash, role });
    await this.saveUsers(users);
    return { ok: true, msg: '' };
  }

  async removeUser(username: string): Promise<{ ok: boolean; msg: string }> {
    const users = await this.getUsers();
    const user = users.get(username);
    if (!user) return { ok: false, msg: '用户不存在' };
    if (user.role === 'admin') {
      const adminCount = Array.from(users.values()).filter(u => u.role === 'admin').length;
      if (adminCount <= 1) return { ok: false, msg: '至少需要保留一个管理员账号' };
    }
    users.delete(username);
    await this.saveUsers(users);
    await this.kv.delete(`accounts:${username}`);
    return { ok: true, msg: '' };
  }

  async validateCredentials(username: string, password: string): Promise<AppUser | null> {
    const user = await this.getUser(username);
    if (!user) return null;
    const hash = await hashPassword(password);
    if (user.password_hash !== hash) return null;
    return user;
  }

  async listUsers(): Promise<AppUser[]> {
    const users = await this.getUsers();
    return Array.from(users.values());
  }

  async ensureAdmin(adminPassword: string = DEFAULT_ADMIN_PASSWORD): Promise<void> {
    const users = await this.getUsers();
    if (users.size === 0) {
      users.set('admin', { username: 'admin', password_hash: await hashPassword(adminPassword || DEFAULT_ADMIN_PASSWORD), role: 'admin' });
      await this.saveUsers(users);
    }
  }

  async createSession(username: string): Promise<string> {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const sessionId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    await this.kv.put(`session:${sessionId}`, username, { expirationTtl: SESSION_TTL_SECONDS });
    return sessionId;
  }

  async getSessionUser(sessionId: string): Promise<AppUser | undefined> {
    const username = await this.kv.get(`session:${sessionId}`);
    if (!username) return undefined;
    return this.getUser(username);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.kv.delete(`session:${sessionId}`);
  }

  async getAccounts(username: string): Promise<Account[]> {
    const data = await this.kv.get(`accounts:${username}`, 'json');
    if (!Array.isArray(data)) return [];
    return data as Account[];
  }

  async saveAccounts(username: string, accounts: Account[]): Promise<void> {
    await this.kv.put(`accounts:${username}`, JSON.stringify(accounts));
  }

  async getTasks(): Promise<Map<string, StudyTask>> {
    const data = await this.kv.get(TASKS_KEY, 'json');
    if (!data || typeof data !== 'object') return new Map();
    const tasks = data as Record<string, StudyTask>;
    return new Map(Object.entries(tasks));
  }

  async saveTasks(tasks: Map<string, StudyTask>): Promise<void> {
    const obj: Record<string, StudyTask> = {};
    tasks.forEach((v, k) => obj[k] = v);
    await this.kv.put(TASKS_KEY, JSON.stringify(obj));
  }

  async getTask(taskId: string): Promise<StudyTask | undefined> {
    const tasks = await this.getTasks();
    return tasks.get(taskId);
  }

  async createTask(task: StudyTask): Promise<void> {
    const tasks = await this.getTasks();
    tasks.set(task.id, task);
    await this.saveTasks(tasks);
  }

  async updateTask(taskId: string, updates: Partial<StudyTask>): Promise<void> {
    const tasks = await this.getTasks();
    const task = tasks.get(taskId);
    if (task) {
      Object.assign(task, updates);
      tasks.set(taskId, task);
      await this.saveTasks(tasks);
    }
  }

  async listTasks(owner: string): Promise<StudyTask[]> {
    const tasks = await this.getTasks();
    return Array.from(tasks.values()).filter(t => t.owner === owner);
  }

  async deleteTask(taskId: string): Promise<void> {
    const tasks = await this.getTasks();
    tasks.delete(taskId);
    await this.saveTasks(tasks);
  }
}
