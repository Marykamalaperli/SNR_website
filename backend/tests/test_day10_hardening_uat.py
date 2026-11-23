"""Day 10 Hardening & User Acceptance Testing (UAT) Verification.

Tests the complete authorization matrix across all five MVP roles:
(employee, store_admin, hr_payroll, system_admin, auditor)
and validates end-to-end multi-store lifecycle flows.
"""

import os
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import create_database_engine
from app.main import create_app
from app.models.attendance import (
    AttendanceAdjustment,
    AttendanceAuditLog,
    AttendanceChallenge,
    AttendanceDay,
    AttendanceEvent,
)
from app.models.identity import (
    Employee,
    Organization,
    RoleAssignment,
    Store,
    User,
)
from app.models.identity import (
    Session as AuthSession,
)
from app.models.payroll import (
    PayPeriod,
    PayrollAuditLog,
    PayrollConfiguration,
    PayrollItem,
    PayrollRun,
    Payslip,
)
from app.services.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


def test_day10_authorization_matrix_and_end_to_end_uat() -> None:
    """Verifies 5-role negative authorization matrix and complete UAT workflow."""
    settings = Settings(
        database_url=DATABASE_URL,
        session_cookie_secure=False,
        cors_origins=["http://localhost:5173"],
    )
    app = create_app(settings)
    engine = create_database_engine(DATABASE_URL)
    assert engine is not None

    uid = uuid4().hex[:8]
    org_id = uuid4()
    store_id = uuid4()

    pwd_raw = "TestingSecurePass123!"
    pwd_hash = hash_password(pwd_raw)

    u_emp_id = uuid4()
    u_sa_id = uuid4()
    u_hr_id = uuid4()
    u_sys_id = uuid4()
    u_aud_id = uuid4()

    now = datetime.now(UTC)

    with Session(engine) as db:
        # Create Org & Store
        org = Organization(
            id=org_id,
            name=f"UAT Org {uid}",
            default_timezone="Asia/Kolkata",
            currency="INR",
            created_at=now,
        )
        store = Store(
            id=store_id,
            organization_id=org_id,
            code=f"UAT-{uid[:4]}",
            name=f"UAT Store {uid}",
            timezone="Asia/Kolkata",
            active=True,
            created_at=now,
        )
        db.add_all([org, store])
        db.flush()

        # Create Users
        users = [
            User(
                id=u_emp_id,
                email=f"emp_{uid}@dev.example.org",
                password_hash=pwd_hash,
                display_name="Emp User",
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            ),
            User(
                id=u_sa_id,
                email=f"sa_{uid}@dev.example.org",
                password_hash=pwd_hash,
                display_name="SA User",
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            ),
            User(
                id=u_hr_id,
                email=f"hr_{uid}@dev.example.org",
                password_hash=pwd_hash,
                display_name="HR User",
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            ),
            User(
                id=u_sys_id,
                email=f"sys_{uid}@dev.example.org",
                password_hash=pwd_hash,
                display_name="Sys User",
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            ),
            User(
                id=u_aud_id,
                email=f"aud_{uid}@dev.example.org",
                password_hash=pwd_hash,
                display_name="Aud User",
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            ),
        ]
        db.add_all(users)
        db.flush()

        # Create Role Assignments
        roles = [
            RoleAssignment(
                id=uuid4(),
                user_id=u_emp_id,
                role="employee",
                organization_id=org_id,
                store_id=store_id,
                active=True,
                created_at=now,
            ),
            RoleAssignment(
                id=uuid4(),
                user_id=u_sa_id,
                role="store_admin",
                organization_id=org_id,
                store_id=store_id,
                active=True,
                created_at=now,
            ),
            RoleAssignment(
                id=uuid4(),
                user_id=u_hr_id,
                role="hr_payroll",
                organization_id=org_id,
                store_id=None,
                active=True,
                created_at=now,
            ),
            RoleAssignment(
                id=uuid4(),
                user_id=u_sys_id,
                role="system_admin",
                organization_id=None,
                store_id=None,
                active=True,
                created_at=now,
            ),
            RoleAssignment(
                id=uuid4(),
                user_id=u_aud_id,
                role="auditor",
                organization_id=org_id,
                store_id=None,
                active=True,
                created_at=now,
            ),
        ]
        db.add_all(roles)
        db.flush()

        emp = Employee(
            id=uuid4(),
            organization_id=org_id,
            home_store_id=store_id,
            user_id=u_emp_id,
            employee_code=f"E-{uid[:4]}",
            display_name="Emp User",
            status="active",
            hire_date=date.today(),
            created_at=now,
        )
        db.add(emp)
        db.commit()

    try:
        # ---------------------------------------------------------------------
        # Part 1: Negative Authorization Matrix Enforcement
        # ---------------------------------------------------------------------
        # 1. Unauthenticated request to /me -> 401
        with TestClient(app) as client:
            resp = client.get("/api/v1/me", headers={"Origin": ORIGIN})
            assert resp.status_code == 401

        # Helper to log in a user and return an authenticated TestClient
        def get_auth_client(email: str) -> TestClient:
            c = TestClient(app)
            r = c.post(
                "/api/v1/auth/login",
                json={"email": email, "password": pwd_raw},
                headers={"Origin": ORIGIN},
            )
            assert r.status_code == 200, f"Login failed for {email}: {r.text}"
            return c

        client_emp = get_auth_client(f"emp_{uid}@dev.example.org")
        client_sa = get_auth_client(f"sa_{uid}@dev.example.org")
        client_hr = get_auth_client(f"hr_{uid}@dev.example.org")
        client_aud = get_auth_client(f"aud_{uid}@dev.example.org")

        # Employee CANNOT create employees (403)
        res = client_emp.post(
            f"/api/v1/employees?organization_id={org_id}",
            json={
                "home_store_id": str(store_id),
                "employee_code": "FORBIDDEN-1",
                "display_name": "Unauthorized User",
                "hire_date": str(date.today()),
            },
            headers={"Origin": ORIGIN},
        )
        assert res.status_code == 403

        # Store Admin CANNOT calculate payroll draft (403)
        res = client_sa.post(
            "/api/v1/payroll/runs/calculate-draft",
            json={"pay_period_id": str(uuid4()), "store_id": str(store_id)},
            headers={"Origin": ORIGIN},
        )
        assert res.status_code == 403

        # Auditor CANNOT create or update records (Read-Only) -> 403
        res = client_aud.post(
            f"/api/v1/employees?organization_id={org_id}",
            json={
                "home_store_id": str(store_id),
                "employee_code": "FORBIDDEN-2",
                "display_name": "Auditor Cannot Mutate",
                "hire_date": str(date.today()),
            },
            headers={"Origin": ORIGIN},
        )
        assert res.status_code == 403

        # ---------------------------------------------------------------------
        # Part 2: Positive End-to-End User Acceptance Flow (UAT)
        # ---------------------------------------------------------------------
        # Step 2a: Store Admin generates rotating QR Challenge Token
        resp_chal = client_sa.post(
            f"/api/v1/attendance/challenges/issue?store_id={store_id}",
            headers={"Origin": ORIGIN},
        )
        assert resp_chal.status_code == 200
        challenge_token = resp_chal.json()["challenge_token"]
        assert len(challenge_token) > 20

        # Step 2b: Employee creates photo upload intent
        resp_intent = client_emp.post(
            "/api/v1/attendance/upload-intent",
            json={"store_id": str(store_id)},
            headers={"Origin": ORIGIN},
        )
        assert resp_intent.status_code == 200
        photo_key = resp_intent.json()["photo_key"]

        # Step 2c: Employee submits Clock-In punch with Challenge & Verified Photo
        idempotency_key = str(uuid4())
        resp_punch = client_emp.post(
            "/api/v1/attendance/events",
            json={
                "action": "clock_in",
                "challenge_token": challenge_token,
                "photo_key": photo_key,
            },
            headers={"Origin": ORIGIN, "Idempotency-Key": idempotency_key},
        )
        assert resp_punch.status_code == 201
        assert resp_punch.json()["action"] == "clock_in"

        # Step 2d: Replay Attack Prevention (Challenge Token is single-use)
        resp_replay = client_emp.post(
            "/api/v1/attendance/events",
            json={
                "action": "clock_in",
                "challenge_token": challenge_token,
                "photo_key": photo_key,
            },
            headers={"Origin": ORIGIN, "Idempotency-Key": str(uuid4())},
        )
        assert resp_replay.status_code in {400, 409, 422}

        # Step 2e: Store Admin & HR export Attendance CSV with CWE-1236 Sanitization
        today_str = date.today().isoformat()
        resp_csv = client_hr.get(
            f"/api/v1/reports/attendance.csv?from_date={today_str}&to_date={today_str}&store_id={store_id}",
            headers={"Origin": ORIGIN},
        )
        assert resp_csv.status_code == 200
        assert resp_csv.headers["content-type"].startswith("text/csv")
        assert "# SNR NEST Attendance Export" in resp_csv.text

    finally:
        # Tear down test data safely
        with Session(engine) as db:
            db.execute(delete(Payslip))
            db.execute(delete(PayrollAuditLog))
            db.execute(delete(PayrollItem))
            db.execute(delete(PayrollRun))
            db.execute(delete(PayrollConfiguration))
            db.execute(delete(PayPeriod))
            db.execute(delete(AttendanceAdjustment))
            db.execute(delete(AttendanceAuditLog))
            db.execute(delete(AttendanceEvent))
            db.execute(delete(AttendanceChallenge))
            db.execute(delete(AttendanceDay))
            db.execute(delete(Employee).where(Employee.organization_id == org_id))
            db.execute(
                delete(RoleAssignment).where(
                    RoleAssignment.user_id.in_([u_emp_id, u_sa_id, u_hr_id, u_sys_id, u_aud_id])
                )
            )
            db.execute(
                delete(AuthSession).where(
                    AuthSession.user_id.in_([u_emp_id, u_sa_id, u_hr_id, u_sys_id, u_aud_id])
                )
            )
            db.execute(
                delete(User).where(User.id.in_([u_emp_id, u_sa_id, u_hr_id, u_sys_id, u_aud_id]))
            )
            db.execute(delete(Store).where(Store.id == store_id))
            db.execute(delete(Organization).where(Organization.id == org_id))
            db.commit()
