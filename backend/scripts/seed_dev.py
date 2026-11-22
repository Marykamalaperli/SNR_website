"""Create synthetic local identities only in an explicit development environment."""

import os
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import select
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
    password = os.getenv("SNR_DEV_SEED_PASSWORD", "")
    if len(password) < 12:
        raise RuntimeError("Set SNR_DEV_SEED_PASSWORD to at least 12 characters")
    engine = create_database_engine(settings.database_url)
    if engine is None:
        raise RuntimeError("Set DATABASE_URL before seeding")
    now = datetime.now(UTC)
    with Session(engine) as db:
        if db.scalar(select(Organization.id).where(Organization.id == ORG_ID)):
            print("Synthetic development organization already exists; no changes made.")
            return
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
            user = User(
                id=user_id,
                email=f"{role}@dev.snrnest.invalid",
                display_name=role.replace("_", " ").title(),
                password_hash=hash_password(password),
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            )
            organization_id = None if role == "system_admin" else ORG_ID
            store_id = STORE_ID if role in {"employee", "store_admin"} else None
            db.add(user)
            db.flush()
            db.add(
                RoleAssignment(
                    id=UUID(f"40000000-0000-4000-8000-{index:012d}"),
                    user_id=user_id,
                    role=role,
                    organization_id=organization_id,
                    store_id=store_id,
                    active=True,
                    created_at=now,
                )
            )
            if role == "employee":
                db.add(
                    Employee(
                        id=UUID("50000000-0000-4000-8000-000000000001"),
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
        db.commit()
    print("Created synthetic development identities. Never use them in staging or production.")


if __name__ == "__main__":
    main()
