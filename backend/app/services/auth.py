import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import DomainError
from app.models.identity import RoleAssignment, User
from app.models.identity import Session as AuthSession
from app.schemas.auth import CurrentUser, Scope

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
DUMMY_PASSWORD_HASH = password_hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LoginThrottle:
    """Per-process pilot throttle; use shared storage before horizontal scaling."""

    def __init__(self, limit: int = 5, window_seconds: int = 300):
        self.limit = limit
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            attempts = self._attempts[key]
            while attempts and attempts[0] <= now - self.window_seconds:
                attempts.popleft()
            if len(attempts) >= self.limit:
                raise DomainError("login_rate_limited", "Sign-in failed. Try again later.", 429)

    def fail(self, key: str) -> None:
        with self._lock:
            self._attempts[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


login_throttle = LoginThrottle()


@dataclass(frozen=True)
class IssuedSession:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


class AuthService:
    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = settings

    def login(self, email: str, password: str, throttle_key: str) -> IssuedSession:
        login_throttle.check(throttle_key)
        normalized = email.strip().lower()
        user = self.db.scalar(select(User).where(User.email == normalized))
        password_matches = verify_password(
            user.password_hash if user else DUMMY_PASSWORD_HASH, password
        )
        if not user or user.status != "active" or not password_matches:
            login_throttle.fail(throttle_key)
            raise DomainError("invalid_credentials", "Email or password is incorrect.", 401)
        login_throttle.clear(throttle_key)
        return self._create_session(user)

    def authenticate(self, access_token: str | None) -> User:
        if not access_token:
            raise DomainError("unauthenticated", "Sign in to continue.", 401)
        now = datetime.now(UTC)
        auth_session = self.db.scalar(
            select(AuthSession).where(AuthSession.access_token_hash == token_hash(access_token))
        )
        if (
            not auth_session
            or auth_session.revoked_at is not None
            or auth_session.access_expires_at <= now
        ):
            raise DomainError("invalid_session", "Your session has expired. Sign in again.", 401)
        user = self.db.get(User, auth_session.user_id)
        if not user or user.status != "active" or user.token_version != auth_session.token_version:
            raise DomainError("invalid_session", "Your session has expired. Sign in again.", 401)
        return user

    def refresh(self, refresh_token: str | None) -> IssuedSession:
        if not refresh_token:
            raise DomainError("invalid_session", "Your session has expired. Sign in again.", 401)
        now = datetime.now(UTC)
        auth_session = self.db.scalar(
            select(AuthSession)
            .where(AuthSession.refresh_token_hash == token_hash(refresh_token))
            .with_for_update()
        )
        if (
            not auth_session
            or auth_session.revoked_at is not None
            or auth_session.refresh_expires_at <= now
        ):
            raise DomainError("invalid_session", "Your session has expired. Sign in again.", 401)
        user = self.db.get(User, auth_session.user_id)
        if not user or user.status != "active" or user.token_version != auth_session.token_version:
            auth_session.revoked_at = now
            self.db.commit()
            raise DomainError("invalid_session", "Your session has expired. Sign in again.", 401)
        issued = self._tokens(now)
        auth_session.access_token_hash = token_hash(issued.access_token)
        auth_session.refresh_token_hash = token_hash(issued.refresh_token)
        auth_session.access_expires_at = issued.access_expires_at
        auth_session.refresh_expires_at = issued.refresh_expires_at
        auth_session.rotated_at = now
        self.db.commit()
        return issued

    def logout(self, access_token: str | None, refresh_token: str | None) -> None:
        hashes = [token_hash(token) for token in (access_token, refresh_token) if token]
        if hashes:
            self.db.execute(
                update(AuthSession)
                .where(
                    (AuthSession.access_token_hash.in_(hashes))
                    | (AuthSession.refresh_token_hash.in_(hashes))
                )
                .values(revoked_at=datetime.now(UTC))
            )
            self.db.commit()

    def current_user(self, user: User) -> CurrentUser:
        assignments = self.db.scalars(
            select(RoleAssignment)
            .where(RoleAssignment.user_id == user.id, RoleAssignment.active.is_(True))
            .order_by(RoleAssignment.role, RoleAssignment.organization_id, RoleAssignment.store_id)
        )
        scopes = tuple(
            Scope(
                role=assignment.role,
                organization_id=assignment.organization_id,
                store_id=assignment.store_id,
            )
            for assignment in assignments
        )
        if not scopes:
            raise DomainError("workspace_not_assigned", "No active workspace is assigned.", 403)
        return CurrentUser(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            scopes=scopes,
        )

    def _create_session(self, user: User) -> IssuedSession:
        now = datetime.now(UTC)
        issued = self._tokens(now)
        self.db.add(
            AuthSession(
                user_id=user.id,
                access_token_hash=token_hash(issued.access_token),
                refresh_token_hash=token_hash(issued.refresh_token),
                access_expires_at=issued.access_expires_at,
                refresh_expires_at=issued.refresh_expires_at,
                token_version=user.token_version,
                created_at=now,
            )
        )
        self.db.commit()
        return issued

    def _tokens(self, now: datetime) -> IssuedSession:
        return IssuedSession(
            access_token=secrets.token_urlsafe(32),
            refresh_token=secrets.token_urlsafe(48),
            access_expires_at=now + timedelta(minutes=self.settings.access_session_minutes),
            refresh_expires_at=now + timedelta(days=self.settings.refresh_session_days),
        )
