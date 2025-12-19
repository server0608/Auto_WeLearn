import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from werkzeug.security import check_password_hash, generate_password_hash


@dataclass
class AppUser:
    username: str
    password_hash: str
    role: str = "user"  # user/admin

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(data: dict) -> "AppUser":
        return AppUser(
            username=data.get("username", ""),
            password_hash=data.get("password_hash", ""),
            role=data.get("role", "user"),
        )


class UserStore:
    """Simple JSON-backed store for application users."""

    def __init__(self, path: str | Path = "data/users.json"):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.accounts_dir = self.path.parent / "accounts"
        self.accounts_dir.mkdir(parents=True, exist_ok=True)
        self.users: Dict[str, AppUser] = {}
        self._load()

        # Ensure there is at least one admin available.
        if not self.users:
            default_password = os.getenv("WELEARN_ADMIN_PASSWORD", "admin123")
            self.add_user("admin", default_password, role="admin")

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError:
            return

        users_data = data.get("users") if isinstance(data, dict) else data
        if not isinstance(users_data, list):
            return

        for item in users_data:
            if isinstance(item, dict):
                user = AppUser.from_dict(item)
                if user.username:
                    self.users[user.username] = user

    def _save(self) -> None:
        payload = {"users": [u.to_dict() for u in self.users.values()]}
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def add_user(self, username: str, password: str, role: str = "user") -> Tuple[bool, str]:
        username = username.strip()
        if not username or not password:
            return False, "用户名和密码不能为空"
        if role not in {"user", "admin"}:
            return False, "角色必须是 user 或 admin"
        if username in self.users:
            return False, "该用户已存在"

        password_hash = generate_password_hash(password)
        self.users[username] = AppUser(username=username, password_hash=password_hash, role=role)
        self._save()
        return True, ""

    def remove_user(self, username: str) -> Tuple[bool, str]:
        if username not in self.users:
            return False, "用户不存在"
        if self.users[username].role == "admin":
            admin_count = sum(1 for u in self.users.values() if u.role == "admin")
            if admin_count <= 1:
                return False, "至少需要保留一个管理员账号"

        del self.users[username]
        self._save()

        # Clean up this user's account file if present.
        account_file = self.account_file_for(username)
        if account_file.exists():
            try:
                account_file.unlink()
            except OSError:
                pass
        return True, ""

    def validate_credentials(self, username: str, password: str) -> Optional[AppUser]:
        user = self.users.get(username)
        if not user:
            return None
        if check_password_hash(user.password_hash, password):
            return user
        return None

    def list_users(self) -> List[AppUser]:
        return list(self.users.values())
    
    def get_user(self, username: str) -> Optional[AppUser]:
        return self.users.get(username)

    def account_file_for(self, username: str) -> Path:
        """Return the path used to store this user's WeLearn accounts."""
        return self.accounts_dir / f"{username}.json"
