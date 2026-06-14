export interface Env {
  WELEARN_STATE: DurableObjectNamespace;
  SECRET_KEY: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

export interface User {
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
}

export interface Account {
  username: string;
  password: string;
  nickname: string;
}

export interface Course {
  cid: string;
  cname: string;
  [key: string]: unknown;
}

export interface Unit {
  name?: string;
  unitname?: string;
  [key: string]: unknown;
}

export interface Chapter {
  id: string;
  location?: string;
  isvisible?: string;
  iscomplete?: string;
  [key: string]: unknown;
}

export interface TaskLog {
  level: 'info' | 'success' | 'warning' | 'danger';
  message: string;
  timestamp: number;
}

export interface TimePlan {
  chapters: Array<{ id: string; name: string }>;
  index: number;
  elapsedSeconds: number;
  perCourseSeconds: number;
  startedCurrent: boolean;
}

export interface HomeworkPlan {
  leaves: Array<{ id: string; name: string; unitIdx: number; isComplete?: string }>;
  index: number;
}

export interface Task {
  id: string;
  owner: string;
  accountUsername: string;
  cid: string;
  courseName: string;
  uid: string;
  classid: string;
  units: number[];
  mode: 'homework' | 'time';
  accuracyRange: [number, number];
  totalMinutes: number;
  randomRange: number;
  maxConcurrent: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  result: Record<string, number | string>;
  logs: TaskLog[];
  timePlan?: TimePlan;
  homeworkPlan?: HomeworkPlan;
  createdAt: number;
  updatedAt: number;
}
