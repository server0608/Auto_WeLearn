import type { AppUser, Account, StudyTask } from './types';

const USERS_KEY = 'users';
const TASKS_KEY = 'tasks';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

function hashPassword(password: string): string {
  let hash = 5381;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) + hash) + password.charCodeAt(i);
    hash = hash & hash;
  }
  return `WELearn_${Math.abs(hash).toString(16)}`;
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
    const password_hash = hashPassword(password);
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
    const hash = hashPassword(password);
    if (user.password_hash !== hash) return null;
    return user;
  }

  async listUsers(): Promise<AppUser[]> {
    const users = await this.getUsers();
    return Array.from(users.values());
  }

  async ensureAdmin(): Promise<void> {
    const users = await this.getUsers();
    if (users.size === 0) {
      users.set('admin', { username: 'admin', password_hash: hashPassword(DEFAULT_ADMIN_PASSWORD), role: 'admin' });
      await this.saveUsers(users);
    }
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
