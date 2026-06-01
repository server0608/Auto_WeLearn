export interface AppUser {
  username: string;
  password_hash: string;
  role: 'user' | 'admin';
}

export interface Account {
  username: string;
  password: string;
  nickname: string;
  status: string;
  progress: string;
  target_course_name?: string;
}

export interface TaskLog {
  level: string;
  message: string;
  timestamp: number;
}

export interface StudyTask {
  id: string;
  owner: string;
  account: Account;
  cid: string;
  course_name: string;
  uid: string;
  classid: string;
  units: number[];
  mode: 'homework' | 'time';
  accuracy_range: [number, number];
  total_minutes: number;
  random_range: number;
  max_concurrent: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  result: Record<string, number | string>;
  logs: TaskLog[];
}

export interface WeLearnCourse {
  cid: string;
  name: string;
  per: string;
}

export interface WeLearnUnit {
  uid: string;
  classid: string;
  units: Array<{ name: string; [key: string]: unknown }>;
}
