import os
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.main import create_app
from app.models.attendance import (
    AttendanceAdjustment,
    AttendanceAuditLog,
    AttendanceChallenge,
    AttendanceDay,
    AttendanceEvent,
)
from app.models.identity import Employee, Organization, RoleAssignment, Store, User
from app.models.identity import Session as AuthSession
from app.models.payroll import (
    PayPeriod,
    PayrollAuditLog,
    PayrollConfiguration,
    PayrollItem,
    PayrollRun,
    Payslip,
)
from app.models.workforce import Shift, ShiftAssignment
from app.services.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


@pytest.fixture
def seeded_attendance():
    engine = create_engine(DATABASE_URL)
    now = datetime.now(UTC)
    org = Organization(
        id=uuid4(),
        name="Attendance Test Org",
        default_timezone="Asia/Kolkata",
        currency="INR",
        created_at=now,
    )
    store = Store(
        id=uuid4(),
        organization_id=org.id,
        code="ATT_STORE",
        name="Attendance Store",
        timezone="Asia/Kolkata",
        created_at=now,
    )
    admin_user = User(
        id=uuid4(),
        email="admin@attendance.example.org",
        display_name="Store Admin",
        password_hash=hash_password("admin-password-1234"),
        status="active",
        token_version=1,
        created_at=now,
        updated_at=now,
    )
    emp_user = User(
        id=uuid4(),
        email="emp@attendance.example.org",
        display_name="Attendance Employee",
        password_hash=hash_password("emp-password-1234"),
        status="active",
        token_version=1,
        created_at=now,
        updated_at=now,
    )
    admin_role = RoleAssignment(
        id=uuid4(),
        user_id=admin_user.id,
        role="store_admin",
        organization_id=org.id,
        store_id=store.id,
        active=True,
        created_at=now,
    )
    emp_role = RoleAssignment(
        id=uuid4(),
        user_id=emp_user.id,
        role="employee",
        organization_id=org.id,
        store_id=store.id,
        active=True,
        created_at=now,
    )
    emp_record = Employee(
        id=uuid4(),
        organization_id=org.id,
        home_store_id=store.id,
        user_id=emp_user.id,
        employee_code="ATT001",
        display_name="Attendance Employee",
        status="active",
        hire_date=date(2026, 1, 1),
        created_at=now,
    )

    with Session(engine, expire_on_commit=False) as db:
        for model in (
            Payslip,
            PayrollAuditLog,
            PayrollItem,
            PayrollRun,
            PayrollConfiguration,
            PayPeriod,
            AttendanceAdjustment,
            AttendanceDay,
            AttendanceAuditLog,
            AttendanceEvent,
            AttendanceChallenge,
            ShiftAssignment,
            Shift,
            AuthSession,
            Employee,
            RoleAssignment,
            User,
            Store,
            Organization,
        ):
            db.execute(delete(model))
        db.add(org)
        db.flush()
        db.add(store)
        db.flush()
        db.add_all([admin_user, emp_user])
        db.flush()
        db.add_all([admin_role, emp_role, emp_record])
        db.commit()

    yield engine, org, store, admin_user, emp_user, emp_record

    with Session(engine) as db:
        for model in (
            Payslip,
            PayrollAuditLog,
            PayrollItem,
            PayrollRun,
            PayrollConfiguration,
            PayPeriod,
            AttendanceAdjustment,
            AttendanceDay,
            AttendanceAuditLog,
            AttendanceEvent,
            AttendanceChallenge,
            ShiftAssignment,
            Shift,
            AuthSession,
            Employee,
            RoleAssignment,
            User,
            Store,
            Organization,
        ):
            db.execute(delete(model))
        db.commit()
    engine.dispose()


def app_client():
    settings = Settings(
        app_env="test",
        database_url=DATABASE_URL,
        session_cookie_secure=False,
    )
    return TestClient(create_app(settings))


def test_attendance_lifecycle(seeded_attendance):
    engine, org, store, admin_user, emp_user, emp_record = seeded_attendance

    # 1. Admin login and issue challenge
    with app_client() as admin_client:
        admin_login = admin_client.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"email": "admin@attendance.example.org", "password": "admin-password-1234"},
        )
        assert admin_login.status_code == 200

        res_challenge = admin_client.post(
            f"/api/v1/attendance/challenges/issue?store_id={store.id}"
        )
        assert res_challenge.status_code == 200
        challenge_token = res_challenge.json()["challenge_token"]
        assert challenge_token.startswith(f"{store.id}:")

    # 2. Employee login
    with app_client() as emp_client:
        emp_login = emp_client.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"email": "emp@attendance.example.org", "password": "emp-password-1234"},
        )
        assert emp_login.status_code == 200

        # Request photo upload intent
        upload_intent = emp_client.post(
            "/api/v1/attendance/upload-intent",
            json={"store_id": str(store.id), "content_type": "image/jpeg"},
        )
        assert upload_intent.status_code == 200
        photo_key = upload_intent.json()["photo_key"]
        assert f"evidence/{org.id}/{store.id}/" in photo_key

        # Missing idempotency key rejected
        missing_idempotency = emp_client.post(
            "/api/v1/attendance/events",
            json={
                "challenge_token": challenge_token,
                "action": "clock_in",
                "photo_key": photo_key,
            },
        )
        assert missing_idempotency.status_code == 400

        # Tampered challenge signature rejected
        tampered_token = challenge_token[:-4] + "ABCD"
        tampered = emp_client.post(
            "/api/v1/attendance/events",
            headers={"Idempotency-Key": "punch-key-10001"},
            json={
                "challenge_token": tampered_token,
                "action": "clock_in",
                "photo_key": photo_key,
            },
        )
        assert tampered.status_code == 403
        assert tampered.json()["error"]["code"] == "invalid_challenge_signature"

        # Valid clock in
        clock_in = emp_client.post(
            "/api/v1/attendance/events",
            headers={"Idempotency-Key": "punch-key-10001"},
            json={
                "challenge_token": challenge_token,
                "action": "clock_in",
                "photo_key": photo_key,
                "location_latitude": 12.9716,
                "location_longitude": 77.5946,
                "location_accuracy": 15.0,
            },
        )
        assert clock_in.status_code == 201
        clock_in_data = clock_in.json()
        assert clock_in_data["action"] == "clock_in"
        assert clock_in_data["employee_id"] == str(emp_record.id)

        # Idempotent re-submission returns existing event
        clock_in_dup = emp_client.post(
            "/api/v1/attendance/events",
            headers={"Idempotency-Key": "punch-key-10001"},
            json={
                "challenge_token": challenge_token,
                "action": "clock_in",
                "photo_key": photo_key,
            },
        )
        assert clock_in_dup.status_code == 201
        assert clock_in_dup.json()["id"] == clock_in_data["id"]

        # Issue another challenge for next action
        with app_client() as admin_client:
            admin_client.post(
                "/api/v1/auth/login",
                headers={"Origin": ORIGIN},
                json={"email": "admin@attendance.example.org", "password": "admin-password-1234"},
            )
            challenge_2 = admin_client.post(
                f"/api/v1/attendance/challenges/issue?store_id={store.id}"
            ).json()["challenge_token"]

        # Clocking in while already clocked in rejected
        already_in = emp_client.post(
            "/api/v1/attendance/events",
            headers={"Idempotency-Key": "punch-key-10002"},
            json={
                "challenge_token": challenge_2,
                "action": "clock_in",
                "photo_key": photo_key,
            },
        )
        assert already_in.status_code == 409
        assert already_in.json()["error"]["code"] == "already_clocked_in"

        # Valid clock out with challenge_2
        clock_out = emp_client.post(
            "/api/v1/attendance/events",
            headers={"Idempotency-Key": "punch-key-10003"},
            json={
                "challenge_token": challenge_2,
                "action": "clock_out",
                "photo_key": photo_key,
            },
        )
        assert clock_out.status_code == 201
        assert clock_out.json()["action"] == "clock_out"

        # Reusing challenge_2 fails with challenge_already_used
        reused_challenge = emp_client.post(
            "/api/v1/attendance/events",
            headers={"Idempotency-Key": "punch-key-10004"},
            json={
                "challenge_token": challenge_2,
                "action": "clock_out",
                "photo_key": photo_key,
            },
        )
        assert reused_challenge.status_code == 409
        assert reused_challenge.json()["error"]["code"] == "challenge_already_used"

        # Verify audit logs in database
        with Session(engine) as db:
            audit_logs = list(
                db.scalars(
                    select(AttendanceAuditLog).where(
                        AttendanceAuditLog.employee_id == emp_record.id
                    )
                )
            )
            assert len(audit_logs) == 2
            assert "clock_in" in audit_logs[0].details
            assert "clock_out" in audit_logs[1].details
