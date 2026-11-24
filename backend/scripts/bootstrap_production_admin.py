"""Idempotently create the initial production system administrator.

Credentials are accepted only through environment variables and are never printed.
"""

import os
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import create_database_engine
from app.models.identity import RoleAssignment, User
from app.services.auth import hash_password


def main() -> None:
    settings = Settings()
    if settings.app_env != "production":
        raise RuntimeError("Production administrator bootstrap requires APP_ENV=production")

    email = os.environ.get("SNR_BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("SNR_BOOTSTRAP_ADMIN_PASSWORD", "")
    if not email or "@" not in email:
        raise RuntimeError("Set SNR_BOOTSTRAP_ADMIN_EMAIL to a valid address")
    if len(password) < 20:
        raise RuntimeError("Set SNR_BOOTSTRAP_ADMIN_PASSWORD to at least 20 characters")

    engine = create_database_engine(settings.database_url)
    if engine is None:
        raise RuntimeError("Production database is not configured")

    now = datetime.now(UTC)
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                display_name="SNR NEST Super Admin",
                password_hash=hash_password(password),
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            )
            db.add(user)
            db.flush()
        else:
            user.password_hash = hash_password(password)
            user.status = "active"
            user.token_version += 1
            user.updated_at = now

        assignment = db.scalar(
            select(RoleAssignment).where(
                RoleAssignment.user_id == user.id,
                RoleAssignment.role == "system_admin",
            )
        )
        if assignment is None:
            db.add(
                RoleAssignment(
                    user_id=user.id,
                    role="system_admin",
                    organization_id=None,
                    store_id=None,
                    active=True,
                    created_at=now,
                )
            )
        else:
            assignment.active = True

        db.commit()

    print(f"Production system administrator is active: {email}")


if __name__ == "__main__":
    main()
