import { WeLearnClient } from './api';
import type { Account, Chapter, Task } from './types';

function log(task: Task, level: 'info' | 'success' | 'warning' | 'danger', message: string): void {
  task.logs.push({ level, message, timestamp: Date.now() / 1000 });
  task.updatedAt = Date.now();
}

function pickAccuracy([low, high]: [number, number]): number {
  const safeLow = Math.max(0, Math.min(100, low));
  const safeHigh = Math.max(0, Math.min(100, high));
  const min = Math.min(safeLow, safeHigh);
  const max = Math.max(safeLow, safeHigh);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function runTaskStep(task: Task, accounts: Account[]): Promise<Task> {
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'stopped') return task;

  const account = accounts.find((item) => item.username === task.accountUsername);
  if (!account) {
    task.status = 'failed';
    log(task, 'danger', '找不到任务对应的 WeLearn 账号');
    return task;
  }

  const client = new WeLearnClient();
  const [loggedIn, message] = await client.login(account.username, account.password);
  if (!loggedIn) {
    task.status = 'failed';
    log(task, 'danger', `登录失败: ${message}`);
    return task;
  }

  task.status = 'running';
  if (task.mode === 'time') return runTimeStep(client, task);
  return runHomeworkTask(client, task);
}

async function runHomeworkTask(client: WeLearnClient, task: Task): Promise<Task> {
  let way1Succeed = Number(task.result.way1_succeed ?? 0);
  let way1Failed = Number(task.result.way1_failed ?? 0);
  let way2Succeed = Number(task.result.way2_succeed ?? 0);
  let way2Failed = Number(task.result.way2_failed ?? 0);

  if (!task.homeworkPlan) {
    const leaves: Array<{ id: string; name: string; unitIdx: number; isComplete?: string }> = [];
    for (const unitIdx of task.units) {
      const [ok, chapters, message] = await client.getScoLeaves(task.cid, task.uid, task.classid, unitIdx);
      if (!ok) {
        log(task, 'danger', `单元 ${unitIdx + 1} 获取失败: ${message}`);
        continue;
      }
      leaves.push(...chapters.filter(isVisibleChapter).map((chapter) => ({ id: chapter.id, name: chapter.location || chapter.id, unitIdx, isComplete: chapter.iscomplete })));
    }
    task.homeworkPlan = { leaves, index: 0 };
    log(task, 'info', `刷作业计划已创建：${leaves.length} 个章节`);
  }

  const batchSize = 5;
  let processed = 0;
  while (task.homeworkPlan.index < task.homeworkPlan.leaves.length && processed < batchSize) {
    if (task.status === 'stopped') return task;
    const chapter = task.homeworkPlan.leaves[task.homeworkPlan.index];
    task.homeworkPlan.index += 1;
    processed += 1;

    if (!(chapter.isComplete || '').includes('未')) {
      log(task, 'info', `${chapter.name} 已完成，跳过`);
      continue;
    }

    const accuracy = pickAccuracy(task.accuracyRange);
    const [w1s, w1f, w2s, w2f] = await client.submitCourseProgress(task.cid, task.uid, task.classid, chapter.id, accuracy);
    way1Succeed += w1s;
    way1Failed += w1f;
    way2Succeed += w2s;
    way2Failed += w2f;
    log(task, w1s || w2s ? 'success' : 'danger', `${chapter.name} 正确率 ${accuracy}%`);
  }

  task.result = { way1_succeed: way1Succeed, way1_failed: way1Failed, way2_succeed: way2Succeed, way2_failed: way2Failed };
  if (task.homeworkPlan.index >= task.homeworkPlan.leaves.length) {
    task.status = 'completed';
    log(task, 'success', '刷作业任务完成');
  }
  return task;
}

async function runTimeStep(client: WeLearnClient, task: Task): Promise<Task> {
  if (!task.timePlan) {
    const chapters: Array<{ id: string; name: string }> = [];
    for (const unitIdx of task.units) {
      const [ok, leaves, message] = await client.getScoLeaves(task.cid, task.uid, task.classid, unitIdx);
      if (!ok) {
        log(task, 'danger', `单元 ${unitIdx + 1} 获取失败: ${message}`);
        continue;
      }
      chapters.push(...leaves.filter(isVisibleChapter).map((chapter) => ({ id: chapter.id, name: chapter.location || chapter.id })));
    }

    if (chapters.length === 0) {
      task.status = 'failed';
      log(task, 'danger', '没有可刷时长的课程');
      return task;
    }

    const actualMinutes = Math.max(1, task.totalMinutes + Math.floor(Math.random() * (task.randomRange * 2 + 1)) - task.randomRange);
    task.timePlan = {
      chapters,
      index: 0,
      elapsedSeconds: 0,
      perCourseSeconds: Math.max(60, Math.floor((actualMinutes * 60) / chapters.length)),
      startedCurrent: false,
    };
    task.result = { way1_succeed: 0, way1_failed: 0, way2_succeed: 0, way2_failed: 0 };
    log(task, 'info', `刷时长计划已创建：${chapters.length} 个课程，每个 ${task.timePlan.perCourseSeconds} 秒`);
  }

  const plan = task.timePlan;
  const current = plan.chapters[plan.index];
  if (!current) {
    task.status = 'completed';
    log(task, 'success', '刷时长任务完成');
    return task;
  }

  const started = await client.startSco(task.cid, task.uid, current.id);
  if (!plan.startedCurrent) log(task, 'info', `开始 ${current.name}`);
  plan.startedCurrent = started || plan.startedCurrent;

  const kept = await client.keepScoTime(task.cid, task.uid, current.id);
  if (started && kept) plan.elapsedSeconds += 60;
  else log(task, 'warning', `${current.name} 本轮时长请求未成功，等待下次 Cron 重试`);

  if (plan.elapsedSeconds >= plan.perCourseSeconds) {
    const ok = await client.finishScoTime(task.cid, task.uid, current.id);
    const successCount = Number(task.result.way1_succeed ?? 0) + (ok ? 1 : 0);
    const failCount = Number(task.result.way1_failed ?? 0) + (ok ? 0 : 1);
    task.result = { way1_succeed: successCount, way1_failed: failCount, way2_succeed: successCount, way2_failed: failCount };
    log(task, ok ? 'success' : 'danger', `${current.name} ${ok ? '完成' : '失败'}`);
    plan.index += 1;
    plan.elapsedSeconds = 0;
    plan.startedCurrent = false;
  }

  if (plan.index >= plan.chapters.length) {
    task.status = 'completed';
    log(task, 'success', '刷时长任务完成');
  }

  return task;
}

function isVisibleChapter(chapter: Chapter): boolean {
  return chapter.isvisible !== 'false';
}
