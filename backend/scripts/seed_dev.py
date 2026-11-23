"""Create synthetic local identities only in an explicit development environment."""

import os
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID

# Ensure the project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import create_database_engine
from app.models.identity import Employee, Organization, RoleAssignment, Store, User
from app.services.auth import hash_password

ORG_ID = UUID("10000000-0000-4000-8000-000000000001")
STORE_ID = UUID("20000000-0000-4000-8000-000000000001")
ROLES = ("employee", "store_admin", "hr_payroll", "system_admin", "auditor")


def main() -> None:
    settings = Settings()
    if settings.app_env != "development":
        raise RuntimeError("Synthetic seed data is allowed only when APP_ENV=development")
    password = os.getenv("SNR_DEV_SEED_PASSWORD", "test-seed-password-123!")
    if len(password) < 12:
        raise RuntimeError("Set SNR_DEV_SEED_PASSWORD to at least 12 characters")
    engine = create_database_engine(settings.database_url)
    if engine is None:
        raise RuntimeError("Set DATABASE_URL before seeding")
    now = datetime.now(UTC)
    with Session(engine) as db:
        org = db.get(Organization, ORG_ID)
        if not org:
            db.add(
                Organization(
                    id=ORG_ID,
                    name="SNR NEST Development",
                    default_timezone="Asia/Kolkata",
                    currency="INR",
                    created_at=now,
                )
            )
            db.flush()
        store = db.get(Store, STORE_ID)
        if not store:
            db.add(
                Store(
                    id=STORE_ID,
                    organization_id=ORG_ID,
                    code="DEV",
                    name="Development Store",
                    timezone="Asia/Kolkata",
                    created_at=now,
                )
            )
            db.flush()
        for index, role in enumerate(ROLES, start=1):
            user_id = UUID(f"30000000-0000-4000-8000-{index:012d}")
            user = db.get(User, user_id)
            email = f"{role}@dev.example.org"
            if user:
                user.email = email
                user.password_hash = hash_password(password)
                user.status = "active"
                user.updated_at = now
            else:
                user = User(
                    id=user_id,
                    email=email,
                    display_name=role.replace("_", " ").title(),
                    password_hash=hash_password(password),
                    status="active",
                    token_version=1,
                    created_at=now,
                    updated_at=now,
                )
                db.add(user)
                db.flush()
            assignment_id = UUID(f"40000000-0000-4000-8000-{index:012d}")
            organization_id = None if role == "system_admin" else ORG_ID
            store_id = STORE_ID if role in {"employee", "store_admin"} else None
            assignment = db.get(RoleAssignment, assignment_id)
            if not assignment:
                db.add(
                    RoleAssignment(
                        id=assignment_id,
                        user_id=user_id,
                        role=role,
                        organization_id=organization_id,
                        store_id=store_id,
                        active=True,
                        created_at=now,
                    )
                )
            if role == "employee":
                emp_id = UUID("50000000-0000-4000-8000-000000000001")
                emp = db.get(Employee, emp_id)
                if not emp:
                    db.add(
                        Employee(
                            id=emp_id,
                            organization_id=ORG_ID,
                            home_store_id=STORE_ID,
                            user_id=user_id,
                            employee_code="DEV001",
                            display_name="Development Employee",
                            status="active",
                            hire_date=date(2026, 1, 1),
                            created_at=now,
                        )
                    )
        # Also provision super_admin alias for developer convenience
        super_admin_id = UUID("30000000-0000-4000-8000-000000000009")
        super_admin_user = db.get(User, super_admin_id)
        if super_admin_user:
            super_admin_user.email = "super_admin@dev.example.org"
            super_admin_user.password_hash = hash_password(password)
            super_admin_user.status = "active"
            super_admin_user.display_name = "Super Admin"
            super_admin_user.updated_at = now
        else:
            db.add(
                User(
                    id=super_admin_id,
                    email="super_admin@dev.example.org",
                    display_name="Super Admin",
                    password_hash=hash_password(password),
                    status="active",
                    token_version=1,
                    created_at=now,
                    updated_at=now,
                )
            )
            db.flush()

        super_ra_id = UUID("40000000-0000-4000-8000-000000000009")
        super_ra = db.get(RoleAssignment, super_ra_id)
        if not super_ra:
            db.add(
                RoleAssignment(
                    id=super_ra_id,
                    user_id=super_admin_id,
                    role="system_admin",
                    organization_id=None,
                    store_id=None,
                    active=True,
                    created_at=now,
                )
            )

        db.commit()
    print("Created synthetic development identities. Never use them in staging or production.")


if __name__ == "__main__":
    main()
