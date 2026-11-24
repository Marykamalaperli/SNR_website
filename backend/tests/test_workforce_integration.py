import os
from datetime import UTC, date, datetime, time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select
from sqlalchemy.exc import IntegrityError
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
def seeded_workforce():
    engine = create_engine(DATABASE_URL)
    now = datetime.now(UTC)
    org = Organization(
        id=uuid4(),
        name="Workforce Test Org",
        default_timezone="Asia/Kolkata",
        currency="INR",
        created_at=now,
    )
    store1 = Store(
        id=uuid4(),
        organization_id=org.id,
        code="S1",
        name="Store One",
        timezone="Asia/Kolkata",
        created_at=now,
    )
    store2 = Store(
        id=uuid4(),
        organization_id=org.id,
        code="S2",
        name="Store Two",
        timezone="Asia/Kolkata",
        created_at=now,
    )

    admin_user = User(
        id=uuid4(),
        email="admin@workforce.example.org",
        display_name="Store Admin",
        password_hash=hash_password("admin-password-1234"),
        status="active",
        token_version=1,
        created_at=now,
        updated_at=now,
    )
    emp_user = User(
        id=uuid4(),
        email="emp@workforce.example.org",
        display_name="Regular Employee",
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
        store_id=store1.id,
        active=True,
        created_at=now,
    )
    emp_role = RoleAssignment(
        id=uuid4(),
        user_id=emp_user.id,
        role="employee",
        organization_id=org.id,
        store_id=store1.id,
        active=True,
        created_at=now,
    )

    emp_record = Employee(
        id=uuid4(),
        organization_id=org.id,
        home_store_id=store1.id,
        user_id=emp_user.id,
        employee_code="WF001",
        display_name="Regular Employee",
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
        db.add_all([store1, store2])
        db.flush()
        db.add_all([admin_user, emp_user])
        db.flush()
        db.add_all([admin_role, emp_role, emp_record])
        db.commit()

    yield engine, org, store1, store2, admin_user, emp_user, emp_record

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


def test_workforce_api_flow(seeded_workforce):
    _engine, org, store1, store2, admin_user, emp_user, emp_record = seeded_workforce

    with app_client() as client:
        # 1. Login as store_admin
        login = client.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"email": "admin@workforce.example.org", "password": "admin-password-1234"},
        )
        assert login.status_code == 200

        # 2. List employees
        res = client.get("/api/v1/employees")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert data["items"][0]["employee_code"] == "WF001"

        # 3. Create a new employee
        create_emp = client.post(
            f"/api/v1/employees?organization_id={org.id}",
            json={
                "employee_code": "WF002",
                "display_name": "New Team Member",
                "home_store_id": str(store1.id),
                "hire_date": "2026-03-01",
                "status": "active",
            },
        )
        assert create_emp.status_code == 201
        assert create_emp.json()["id"]

        # Duplicate employee code fails
        dup_emp = client.post(
            f"/api/v1/employees?organization_id={org.id}",
            json={
                "employee_code": "WF002",
                "display_name": "Duplicate Code",
                "home_store_id": str(store1.id),
                "hire_date": "2026-03-01",
                "status": "active",
            },
        )
        assert dup_emp.status_code == 409
        assert dup_emp.json()["error"]["code"] == "duplicate_employee_code"

        # 4. Create shifts (one daytime, one overnight)
        shift_morning = client.post(
            f"/api/v1/shifts?organization_id={org.id}",
            json={
                "code": "MORN",
                "name": "Morning Shift",
                "store_id": str(store1.id),
                "start_time": "08:00:00",
                "end_time": "16:30:00",
                "break_minutes": 30,
                "is_overnight": False,
            },
        )
        assert shift_morning.status_code == 201
        morning_id = shift_morning.json()["id"]

        shift_night = client.post(
            f"/api/v1/shifts?organization_id={org.id}",
            json={
                "code": "NIGHT",
                "name": "Overnight Shift",
                "store_id": str(store1.id),
                "start_time": "22:00:00",
                "end_time": "06:00:00",
                "break_minutes": 45,
                "is_overnight": True,
            },
        )
        assert shift_night.status_code == 201
        night_id = shift_night.json()["id"]
        assert shift_night.json()["is_overnight"] is True

        # 5. List shifts
        shifts_res = client.get("/api/v1/shifts")
        assert shifts_res.status_code == 200
        assert shifts_res.json()["total"] == 2

        # 6. Assign shift to employee
        assign1 = client.post(
            f"/api/v1/assignments?organization_id={org.id}",
            json={
                "employee_id": str(emp_record.id),
                "shift_id": morning_id,
                "effective_from": "2026-06-01",
                "effective_until": "2026-06-30",
            },
        )
        assert assign1.status_code == 201

        # 7. Overlapping assignment is rejected
        assign_overlap = client.post(
            f"/api/v1/assignments?organization_id={org.id}",
            json={
                "employee_id": str(emp_record.id),
                "shift_id": night_id,
                "effective_from": "2026-06-15",
                "effective_until": "2026-07-15",
            },
        )
        assert assign_overlap.status_code == 409
        assert assign_overlap.json()["error"]["code"] == "overlapping_assignment"

        # 8. Non-overlapping assignment succeeds
        assign2 = client.post(
            f"/api/v1/assignments?organization_id={org.id}",
            json={
                "employee_id": str(emp_record.id),
                "shift_id": night_id,
                "effective_from": "2026-07-01",
                "effective_until": "2026-07-31",
            },
        )
        assert assign2.status_code == 201

        # 9. List assignments
        assignments_res = client.get(f"/api/v1/assignments?employee_id={emp_record.id}")
        assert assignments_res.status_code == 200
        assert assignments_res.json()["total"] == 2


def test_shift_assignment_database_constraints(seeded_workforce):
    engine, org, store1, _store2, admin_user, emp_user, emp_record = seeded_workforce
    now = datetime.now(UTC)

    with Session(engine) as db:
        shift = Shift(
            id=uuid4(),
            organization_id=org.id,
            store_id=store1.id,
            code="TEST",
            name="Test Shift",
            start_time=time(9, 0),
            end_time=time(17, 0),
            created_at=now,
            updated_at=now,
        )
        db.add(shift)
        db.commit()

        # Database CheckConstraint: effective_from <= effective_until
        invalid_assignment = ShiftAssignment(
            id=uuid4(),
            organization_id=org.id,
            employee_id=emp_record.id,
            shift_id=shift.id,
            effective_from=date(2026, 7, 31),
            effective_until=date(2026, 7, 1),
            created_at=now,
            created_by=admin_user.id,
        )
        db.add(invalid_assignment)
        with pytest.raises(IntegrityError):
            db.commit()


def test_employee_registration_auto_provisions_user_account(seeded_workforce):
    engine, org, store1, _store2, admin_user, _emp_user, _emp_record = seeded_workforce
    settings = Settings(
        app_env="test",
        database_url=DATABASE_URL,
        session_secret="test-session-secret-at-least-32-bytes-long",
        qr_signing_secret="test-qr-signing-secret-at-least-32-bytes",
    )
    app = create_app(settings)

    with TestClient(app, base_url="http://testserver") as client:
        # Login as store admin
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": admin_user.email, "password": "admin-password-1234"},
            headers={"Origin": ORIGIN},
        )
        assert login_res.status_code == 200

        # Register employee with email & role
        create_res = client.post(
            f"/api/v1/employees?organization_id={org.id}",
            json={
                "employee_code": "EMP-AUTO-777",
                "display_name": "Karthik Raja",
                "home_store_id": str(store1.id),
                "hire_date": "2026-11-24",
                "status": "active",
                "email": "karthik.raja@example.org",
                "role": "store_manager",
            },
        )
        assert create_res.status_code == 201
        data = create_res.json()
        assert data["employee_code"] == "EMP-AUTO-777"
        assert data["login_email"] == "karthik.raja@example.org"
        assert data["temporary_password"] == "SNR@EMP-AUTO-777"
        assert data["user_id"] is not None

        # Verify that the newly registered employee can log in immediately with the temporary password
        emp_login = client.post(
            "/api/v1/auth/login",
            json={"email": "karthik.raja@example.org", "password": "SNR@EMP-AUTO-777"},
            headers={"Origin": ORIGIN},
        )
        assert emp_login.status_code == 200
        assert emp_login.json()["status"] == "authenticated"

        # Verify database user and role assignment
        with Session(engine) as db:
            new_user = db.scalar(select(User).where(User.email == "karthik.raja@example.org"))
            assert new_user is not None
            assert new_user.display_name == "Karthik Raja"
            assert new_user.status == "active"

            ra = db.scalar(select(RoleAssignment).where(RoleAssignment.user_id == new_user.id))
            assert ra is not None
            assert ra.role == "store_admin"
            assert ra.store_id == store1.id
