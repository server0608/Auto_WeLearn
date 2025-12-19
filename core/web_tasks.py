import random
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from core.api import WeLearnClient
from core.account_manager import Account


@dataclass
class TaskLog:
    level: str
    message: str
    timestamp: float = field(default_factory=time.time)


class StudyTask:
    """后台学习任务，复用核心 API 实现“刷作业/刷时长”"""

    def __init__(
        self,
        owner: str,
        account: Account,
        cid: str,
        course_name: str,
        uid: str,
        classid: str,
        units: List[int],
        mode: str,
        accuracy_range: Tuple[int, int],
        total_minutes: int,
        random_range: int,
        max_concurrent: int,
    ):
        self.id = uuid.uuid4().hex[:8]
        self.owner = owner
        self.account = account
        self.cid = cid
        self.course_name = course_name
        self.uid = uid
        self.classid = classid
        self.units = units
        self.mode = mode  # homework | time
        self.accuracy_range = accuracy_range
        self.total_minutes = total_minutes
        self.random_range = random_range
        self.max_concurrent = max_concurrent

        self.status = "pending"  # pending/running/completed/failed/stopped
        self.result: Dict[str, int | str] = {}
        self.logs: List[TaskLog] = []

        self._thread = threading.Thread(target=self._run, daemon=True)
        self._stop_flag = threading.Event()
        self._lock = threading.Lock()

    # ---------- lifecycle ----------
    def start(self):
        self._thread.start()

    def stop(self):
        self._stop_flag.set()
        self._log("warning", "收到停止指令，尝试终止任务...")

    def _run(self):
        client = WeLearnClient()
        self.status = "running"
        self._log("info", f"登录 WeLearn 账号 {self.account.username} ...")

        ok, msg = client.login(self.account.username, self.account.password)
        if not ok:
            self.status = "failed"
            self._log("danger", f"登录失败: {msg}")
            return

        self._log("success", "登录成功，开始处理课程")

        try:
            if self.mode == "time":
                self._run_time_mode(client)
            else:
                self._run_homework_mode(client)

            if self._stop_flag.is_set():
                self.status = "stopped"
                self._log("warning", "任务已停止")
            elif self.status != "failed":
                self.status = "completed"
                self._log("success", "任务完成")
        except Exception as exc:  # noqa: BLE001
            self.status = "failed"
            self._log("danger", f"任务异常: {exc}")

    # ---------- modes ----------
    def _run_homework_mode(self, client: WeLearnClient):
        way1_s, way1_f, way2_s, way2_f = 0, 0, 0, 0

        for unit_idx in self.units:
            if self._stop_flag.is_set():
                break
            self._log("info", f"开始单元 {unit_idx + 1}")

            ok, leaves, message = client.get_sco_leaves(self.cid, self.uid, self.classid, unit_idx)
            if not ok:
                self._log("danger", f"获取单元失败: {message}")
                continue

            for chapter in leaves:
                if self._stop_flag.is_set():
                    break

                name = chapter.get("location", f"课程 {chapter.get('id', '')}")
                if chapter.get("isvisible") == "false":
                    self._log("warning", f"跳过隐藏课程: {name}")
                    continue

                is_complete = chapter.get("iscomplete", "")
                if isinstance(is_complete, str) and "未" in is_complete:
                    accuracy = self._pick_accuracy()
                    w1_s, w1_f, w2_s, w2_f = client.submit_course_progress(
                        self.cid, self.uid, self.classid, chapter["id"], accuracy
                    )
                    way1_s += w1_s
                    way1_f += w1_f
                    way2_s += w2_s
                    way2_f += w2_f
                    self._log("success", f"[完成] {name} - 正确率 {accuracy}% (步骤1:{'成功' if w1_s else '失败'}, 步骤2:{'成功' if w2_s else '失败'})")
                else:
                    self._log("info", f"[已完成] {name}")

        self.result = {
            "way1_succeed": way1_s,
            "way1_failed": way1_f,
            "way2_succeed": way2_s,
            "way2_failed": way2_f,
        }

    def _run_time_mode(self, client: WeLearnClient):
        all_chapters = []
        for unit_idx in self.units:
            if self._stop_flag.is_set():
                break
            ok, leaves, message = client.get_sco_leaves(self.cid, self.uid, self.classid, unit_idx)
            if not ok:
                self._log("danger", f"单元 {unit_idx + 1} 获取失败: {message}")
                continue
            visible = [ch for ch in leaves if ch.get("isvisible") != "false"]
            all_chapters.extend(visible)
            self._log("info", f"单元 {unit_idx + 1}: 可刷课程 {len(visible)} 个")

        if not all_chapters:
            self.status = "failed"
            self._log("danger", "没有可刷的课程")
            return

        actual_minutes = max(1, self.total_minutes + random.randint(-self.random_range, self.random_range))
        total_seconds = actual_minutes * 60
        per_course_seconds = max(1, total_seconds // len(all_chapters))

        self._log("info", f"总课程 {len(all_chapters)} 个，总时长 {actual_minutes} 分钟，每课程 {per_course_seconds} 秒，并发 {self.max_concurrent}")

        success_count, fail_count = 0, 0

        def run_course(chapter):
            if self._stop_flag.is_set():
                return False
            name = chapter.get("location", f"课程 {chapter.get('id', '')}")
            self._log("info", f"[开始] {name} - {per_course_seconds} 秒")
            ok = self._simulate_time(client, self.cid, self.uid, chapter["id"], per_course_seconds)
            if ok:
                self._log("success", f"[完成] {name}")
            else:
                self._log("danger", f"[失败] {name}")
            return ok

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {executor.submit(run_course, ch): ch for ch in all_chapters}
            for future in as_completed(futures):
                if self._stop_flag.is_set():
                    executor.shutdown(wait=False, cancel_futures=True)
                    break
                if future.result():
                    success_count += 1
                else:
                    fail_count += 1

        self.result = {
            "way1_succeed": success_count,
            "way1_failed": fail_count,
            "way2_succeed": success_count,
            "way2_failed": fail_count,
        }

    # ---------- helpers ----------
    def _pick_accuracy(self) -> int:
        low, high = self.accuracy_range
        if low < 0:
            low = 0
        if high > 100:
            high = 100
        if low > high:
            low, high = high, low
        return random.randint(low, high)

    def _simulate_time(self, client: WeLearnClient, cid: str, uid: str, scoid: str, seconds: int) -> bool:
        """带可中断的刷时长实现"""
        try:
            common_data = {"uid": uid, "cid": cid, "scoid": scoid}
            common_headers = {"Referer": f"{client.BASE_URL}/student/StudyCourse.aspx"}
            ajax_url = f"{client.BASE_URL}/Ajax/SCO.aspx"

            client.session.post(ajax_url, data={**common_data, "action": "startsco160928"}, headers=common_headers)

            for current_time in range(1, seconds + 1):
                if self._stop_flag.is_set():
                    return False
                time.sleep(1)
                if current_time % 60 == 0:
                    client.session.post(
                        ajax_url,
                        data={**common_data, "action": "keepsco_with_getticket_with_updatecmitime"},
                        headers=common_headers,
                    )

            client.session.post(
                ajax_url,
                data={
                    **common_data,
                    "action": "savescoinfo160928",
                    "progress": "100",
                    "crate": "0",
                    "status": "unknown",
                    "cstatus": "completed",
                    "trycount": "0",
                },
                headers=common_headers,
            )
            return True
        except Exception:
            return False

    def _log(self, level: str, message: str):
        with self._lock:
            self.logs.append(TaskLog(level=level, message=message))


class WebTaskManager:
    """全局任务调度"""

    def __init__(self):
        self.tasks: Dict[str, StudyTask] = {}
        self._lock = threading.Lock()

    def create_task(
        self,
        owner: str,
        account: Account,
        cid: str,
        course_name: str,
        uid: str,
        classid: str,
        units: List[int],
        mode: str,
        accuracy_range: Tuple[int, int],
        total_minutes: int,
        random_range: int,
        max_concurrent: int,
    ) -> StudyTask:
        task = StudyTask(
            owner=owner,
            account=account,
            cid=cid,
            course_name=course_name,
            uid=uid,
            classid=classid,
            units=units,
            mode=mode,
            accuracy_range=accuracy_range,
            total_minutes=total_minutes,
            random_range=random_range,
            max_concurrent=max_concurrent,
        )
        with self._lock:
            self.tasks[task.id] = task
        task.start()
        return task

    def get_task(self, task_id: str) -> Optional[StudyTask]:
        with self._lock:
            return self.tasks.get(task_id)

    def list_tasks(self, owner: str) -> List[StudyTask]:
        with self._lock:
            return [t for t in self.tasks.values() if t.owner == owner]

    def stop_task(self, task_id: str) -> bool:
        task = self.get_task(task_id)
        if not task:
            return False
        task.stop()
        return True
