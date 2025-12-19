import os
import time
from functools import wraps
from typing import Callable, Optional, List

from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from core.account_manager import AccountManager
from core.api import WeLearnClient
from core.user_store import AppUser, UserStore
from core.web_tasks import WebTaskManager

app = Flask(__name__)
app.secret_key = os.getenv("WELEARN_WEB_SECRET", "change-me")

user_store = UserStore()
task_manager = WebTaskManager()


@app.template_filter("datetimeformat")
def datetimeformat(value, fmt: str = "%H:%M:%S"):
    try:
        return time.strftime(fmt, time.localtime(value))
    except Exception:  # noqa: BLE001
        return value


def current_user() -> Optional[AppUser]:
    username = session.get("username")
    if not username:
        return None
    return user_store.get_user(username)


def login_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user():
            flash("请先登录", "warning")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def admin_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            flash("请先登录", "warning")
            return redirect(url_for("login"))
        if user.role != "admin":
            flash("需要管理员权限", "danger")
            return redirect(url_for("dashboard"))
        return view(*args, **kwargs)

    return wrapped


def load_account_manager(username: str) -> tuple[AccountManager, str]:
    manager = AccountManager()
    account_file = user_store.account_file_for(username)
    manager.load_from_file(account_file)
    return manager, str(account_file)


@app.route("/", methods=["GET"])
def index():
    if current_user():
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        next_url = request.args.get("next") or url_for("dashboard")

        user = user_store.validate_credentials(username, password)
        if user:
            session["username"] = user.username
            flash("登录成功", "success")
            return redirect(next_url)
        flash("用户名或密码错误", "danger")

    return render_template("login.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.pop("username", None)
    flash("已退出登录", "info")
    return redirect(url_for("login"))


@app.route("/dashboard", methods=["GET"])
@login_required
def dashboard():
    user = current_user()
    manager, _ = load_account_manager(user.username)
    accounts = manager.get_all_accounts()
    tasks = task_manager.list_tasks(user.username)
    return render_template("dashboard.html", user=user, accounts=accounts, tasks=tasks)


@app.route("/accounts/<string:account_username>/courses", methods=["GET"])
@login_required
def account_courses(account_username: str):
    user = current_user()
    manager, _ = load_account_manager(user.username)
    account = manager.get_account(account_username)
    if not account:
        flash("未找到该账号", "warning")
        return redirect(url_for("dashboard"))

    client = WeLearnClient()
    ok, msg = client.login(account.username, account.password)
    if not ok:
        flash(f"登录失败: {msg}", "danger")
        return redirect(url_for("dashboard"))

    ok, courses, message = client.get_courses()
    if not ok:
        flash(f"获取课程失败: {message}", "danger")
        return redirect(url_for("dashboard"))

    return render_template(
        "courses.html",
        user=user,
        account=account,
        courses=courses,
    )


@app.route("/accounts/<string:account_username>/courses/<string:cid>/units", methods=["GET"])
@login_required
def account_units(account_username: str, cid: str):
    user = current_user()
    manager, _ = load_account_manager(user.username)
    account = manager.get_account(account_username)
    if not account:
        flash("未找到该账号", "warning")
        return redirect(url_for("dashboard"))

    client = WeLearnClient()
    ok, msg = client.login(account.username, account.password)
    if not ok:
        flash(f"登录失败: {msg}", "danger")
        return redirect(url_for("dashboard"))

    ok, data, message = client.get_course_info(cid)
    if not ok or not data:
        flash(f"获取单元失败: {message}", "danger")
        return redirect(url_for("account_courses", account_username=account_username))

    course_name = request.args.get("course_name", "")
    return render_template(
        "units.html",
        user=user,
        account=account,
        course_name=course_name,
        cid=cid,
        uid=data["uid"],
        classid=data["classid"],
        units=data.get("units", []),
    )


@app.route("/tasks/start", methods=["POST"])
@login_required
def start_task():
    user = current_user()
    account_username = request.form.get("account_username", "")
    course_name = request.form.get("course_name", "")
    cid = request.form.get("cid", "")
    uid = request.form.get("uid", "")
    classid = request.form.get("classid", "")

    units_raw: List[str] = request.form.getlist("units")
    units = [int(u) for u in units_raw if u.isdigit()]
    if not units:
        flash("请至少选择一个单元", "warning")
        return redirect(url_for("dashboard"))

    mode = request.form.get("mode", "homework")
    accuracy_min = int(request.form.get("accuracy_min", "100") or 100)
    accuracy_max = int(request.form.get("accuracy_max", "100") or 100)
    total_minutes = int(request.form.get("total_minutes", "60") or 60)
    random_range = int(request.form.get("random_range", "5") or 5)
    max_concurrent = int(request.form.get("max_concurrent", "5") or 5)

    accuracy_min = max(0, min(100, accuracy_min))
    accuracy_max = max(accuracy_min, min(100, accuracy_max))
    total_minutes = max(1, total_minutes)
    random_range = max(0, random_range)
    max_concurrent = max(1, max_concurrent)

    manager, _ = load_account_manager(user.username)
    account = manager.get_account(account_username)
    if not account:
        flash("未找到该账号", "warning")
        return redirect(url_for("dashboard"))

    task = task_manager.create_task(
        owner=user.username,
        account=account,
        cid=cid,
        course_name=course_name,
        uid=uid,
        classid=classid,
        units=units,
        mode=mode,
        accuracy_range=(accuracy_min, accuracy_max),
        total_minutes=total_minutes,
        random_range=random_range,
        max_concurrent=max_concurrent,
    )

    flash("任务已创建，正在后台执行", "success")
    return redirect(url_for("task_detail", task_id=task.id))


@app.route("/tasks/<string:task_id>", methods=["GET"])
@login_required
def task_detail(task_id: str):
    user = current_user()
    task = task_manager.get_task(task_id)
    if not task or task.owner != user.username:
        flash("任务不存在或无权限查看", "danger")
        return redirect(url_for("dashboard"))
    return render_template("task_detail.html", user=user, task=task)


@app.route("/tasks/<string:task_id>/stop", methods=["POST"])
@login_required
def task_stop(task_id: str):
    user = current_user()
    task = task_manager.get_task(task_id)
    if not task or task.owner != user.username:
        flash("任务不存在或无权限操作", "danger")
        return redirect(url_for("dashboard"))
    task_manager.stop_task(task_id)
    flash("停止指令已发送", "info")
    return redirect(url_for("task_detail", task_id=task_id))


@app.route("/accounts", methods=["POST"])
@login_required
def add_account():
    user = current_user()
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()
    nickname = request.form.get("nickname", "").strip()

    if not username or not password:
        flash("账号和密码不能为空", "warning")
        return redirect(url_for("dashboard"))

    manager, path = load_account_manager(user.username)
    if manager.add_account(username, password, nickname):
        manager.save_to_file(path)
        flash("账号添加成功", "success")
    else:
        flash("该账号已存在", "warning")

    return redirect(url_for("dashboard"))


@app.route("/accounts/<string:account_username>/delete", methods=["POST"])
@login_required
def delete_account(account_username: str):
    user = current_user()
    manager, path = load_account_manager(user.username)
    if manager.remove_account(account_username):
        manager.save_to_file(path)
        flash("账号已删除", "info")
    else:
        flash("未找到指定账号", "warning")
    return redirect(url_for("dashboard"))


@app.route("/admin/users", methods=["GET"])
@admin_required
def admin_users():
    users = user_store.list_users()
    return render_template("admin_users.html", user=current_user(), users=users)


@app.route("/admin/users", methods=["POST"])
@admin_required
def admin_add_user():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()
    role = request.form.get("role", "user")

    success, message = user_store.add_user(username, password, role=role)
    if success:
        flash("用户创建成功", "success")
    else:
        flash(message or "创建失败", "danger")
    return redirect(url_for("admin_users"))


@app.route("/admin/users/<string:username>/delete", methods=["POST"])
@admin_required
def admin_delete_user(username: str):
    me = current_user()
    if me and me.username == username:
        flash("不能删除当前登录的管理员", "warning")
        return redirect(url_for("admin_users"))

    success, message = user_store.remove_user(username)
    if success:
        flash("用户已删除", "info")
    else:
        flash(message or "删除失败", "danger")
    return redirect(url_for("admin_users"))


if __name__ == "__main__":
    host = os.getenv("WELEARN_WEB_HOST", "0.0.0.0")
    port = int(os.getenv("WELEARN_WEB_PORT", "8000"))
    debug = os.getenv("WELEARN_WEB_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
