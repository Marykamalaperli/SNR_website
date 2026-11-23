import os
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import create_database_engine
from app.main import create_app
from app.models.attendance import AttendanceDay
from app.models.identity import (
    Employee,
    Organization,
    RoleAssignment,
    Store,
    User,
)
from app.services.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


def test_payroll_draft_engine_deterministic_acceptance():
    settings = Settings(
        app_env="development",
        database_url=DATABASE_URL,
        allowed_hosts=["testserver", "localhost", "127.0.0.1"],
        cors_origins=[ORIGIN],
        session_cookie_secure=False,
    )
    app = create_app(settings)
    engine = create_database_engine(DATABASE_URL)
    assert engine is not None

    with Session(engine) as db:
        uid = uuid4().hex[:8]
        now = datetime.now(UTC)
        start_date = date(2026, 11, 1)
        end_date = date(2026, 11, 15)
        cutoff_date = date(2026, 11, 16)

        # 1. Organization & Store
        org = Organization(
            id=uuid4(),
            name=f"Org Payroll {uid}",
            default_timezone="Asia/Kolkata",
            currency="INR",
            created_at=now,
        )
        store = Store(
            id=uuid4(),
            organization_id=org.id,
            code=f"STR-{uid[:4]}",
            name=f"Store {uid}",
            timezone="Asia/Kolkata",
            active=True,
            created_at=now,
        )
        db.add_all([org, store])
        db.flush()

        # 2. Users: HR, Store Admin, Employee
        password_plain = "pw-12345678-strong"
        hr_user = User(
            id=uuid4(),
            email=f"hr_{uid}@dev.snrnest.org",
            password_hash=hash_password(password_plain),
            display_name=f"HR Manager {uid}",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        store_admin_user = User(
            id=uuid4(),
            email=f"sa_{uid}@dev.snrnest.org",
            password_hash=hash_password(password_plain),
            display_name=f"Store Admin {uid}",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        employee_user = User(
            id=uuid4(),
            email=f"emp_{uid}@dev.snrnest.org",
            password_hash=hash_password(password_plain),
            display_name=f"Staff {uid}",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        db.add_all([hr_user, store_admin_user, employee_user])
        db.flush()

        # Role assignments
        hr_role = RoleAssignment(
            id=uuid4(),
            user_id=hr_user.id,
            organization_id=org.id,
            role="hr_payroll",
            created_at=now,
        )
        sa_role = RoleAssignment(
            id=uuid4(),
            user_id=store_admin_user.id,
            organization_id=org.id,
            store_id=store.id,
            role="store_admin",
            created_at=now,
        )
        emp_role = RoleAssignment(
            id=uuid4(),
            user_id=employee_user.id,
            organization_id=org.id,
            store_id=store.id,
            role="employee",
            created_at=now,
        )
        db.add_all([hr_role, sa_role, emp_role])
        db.flush()

        # Employee profile
        employee = Employee(
            id=uuid4(),
            organization_id=org.id,
            home_store_id=store.id,
            user_id=employee_user.id,
            employee_code=f"EMP_{uid}",
            display_name="Alice Tester",
            status="active",
            hire_date=start_date,
            created_at=now,
        )
        db.add(employee)
        db.commit()

        # Clients logging in
        hr_client = TestClient(app)
        sa_client = TestClient(app)
        emp_client = TestClient(app)

        res = hr_client.post(
            "/api/v1/auth/login",
            json={"email": hr_user.email, "password": password_plain},
            headers={"Origin": ORIGIN},
        )
        assert res.status_code == 200

        res = sa_client.post(
            "/api/v1/auth/login",
            json={"email": store_admin_user.email, "password": password_plain},
            headers={"Origin": ORIGIN},
        )
        assert res.status_code == 200

        res = emp_client.post(
            "/api/v1/auth/login",
            json={"email": employee_user.email, "password": password_plain},
            headers={"Origin": ORIGIN},
        )
        assert res.status_code == 200

        # --- Acceptance Test 5: Role isolation / negative access ---
        # Employee and Store Admin cannot access payroll endpoints
        sa_resp = sa_client.get("/api/v1/payroll/pay-periods")
        assert sa_resp.status_code == 403
        emp_resp = emp_client.get("/api/v1/payroll/pay-periods")
        assert emp_resp.status_code == 403

        # --- 1. HR creates pay period ---
        period_res = hr_client.post(
            "/api/v1/payroll/pay-periods",
            json={
                "name": f"Period Nov 1-15 {uid}",
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "cutoff_date": cutoff_date.isoformat(),
            },
        )
        assert period_res.status_code == 201, period_res.text
        period_data = period_res.json()
        period_id = period_data["id"]
        assert period_data["status"] == "open"

        # Duplicate period rejected
        dup_res = hr_client.post(
            "/api/v1/payroll/pay-periods",
            json={
                "name": "Duplicate Period",
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "cutoff_date": cutoff_date.isoformat(),
            },
        )
        assert dup_res.status_code == 409

        # --- Acceptance Test 3: Missing rate configuration blocks calculation ---
        calc_fail_res = hr_client.post(
            "/api/v1/payroll/runs/calculate-draft",
            json={"pay_period_id": period_id},
        )
        assert calc_fail_res.status_code == 422
        assert "no active rate configuration" in calc_fail_res.json()["error"]["message"]

        # Configure hourly rate: ₹ 250.75 per hour
        config_res = hr_client.post(
            "/api/v1/payroll/configurations",
            json={
                "employee_id": str(employee.id),
                "hourly_rate": "250.75",
                "effective_from": start_date.isoformat(),
            },
        )
        assert config_res.status_code == 201, config_res.text
        assert config_res.json()["hourly_rate"] == "250.75"

        # --- Acceptance Test 3: Unresolved attendance exception blocks calculation ---
        # Add an attendance day with missing punch
        bad_day = AttendanceDay(
            id=uuid4(),
            organization_id=org.id,
            store_id=store.id,
            employee_id=employee.id,
            work_date=start_date,
            payable_minutes=240,
            status="missing_punch",
            is_missing_punch=True,
            version=1,
            created_at=now,
            updated_at=now,
        )
        db.add(bad_day)
        db.commit()

        # Should be blocked when block_unresolved_exceptions=True
        calc_blocked = hr_client.post(
            "/api/v1/payroll/runs/calculate-draft",
            json={"pay_period_id": period_id, "block_unresolved_exceptions": True},
        )
        assert calc_blocked.status_code == 422
        assert "unresolved attendance exceptions" in calc_blocked.json()["error"]["message"]

        # Resolve attendance day: change status to present and is_missing_punch to False
        bad_day.status = "present"
        bad_day.is_missing_punch = False
        # 485 minutes = 8 hours and 5 minutes
        bad_day.payable_minutes = 485
        db.commit()

        # Add second day: 540 minutes = exactly 9 hours
        day2 = AttendanceDay(
            id=uuid4(),
            organization_id=org.id,
            store_id=store.id,
            employee_id=employee.id,
            work_date=start_date + timedelta(days=1),
            payable_minutes=540,
            status="present",
            is_missing_punch=False,
            version=1,
            created_at=now,
            updated_at=now,
        )
        db.add(day2)
        db.commit()

        # --- Acceptance Test 1 & 2: Deterministic calculation & decimal rounding ---
        calc_res1 = hr_client.post(
            "/api/v1/payroll/runs/calculate-draft",
            json={"pay_period_id": period_id},
        )
        assert calc_res1.status_code == 201, calc_res1.text
        run1 = calc_res1.json()

        # Check watermark
        assert run1["watermark"] == "Draft - Not for payment"

        # Check total minutes: 485 + 540 = 1025 minutes (17.0833 hrs)
        assert run1["total_payable_minutes"] == 1025
        # Total Gross:
        # Day 1: 485 / 60 * 250.75 = 2026.895833... -> 2026.90
        # Day 2: 540 / 60 * 250.75 = 2256.75
        # Combined for employee: 1025 / 60 * 250.75 = 4283.645833... -> 4283.65
        assert run1["total_gross_pay"] == "4283.65"
        assert run1["total_net_pay"] == "4283.65"

        # Acceptance Test 1: Calculate again with identical inputs
        # MUST produce identical hash & totals
        calc_res2 = hr_client.post(
            "/api/v1/payroll/runs/calculate-draft",
            json={"pay_period_id": period_id},
        )
        assert calc_res2.status_code == 201
        run2 = calc_res2.json()

        assert run2["input_hash"] == run1["input_hash"], (
            "Deterministic input SHA-256 must match exactly"
        )
        assert run2["total_gross_pay"] == run1["total_gross_pay"]
        assert run2["total_payable_minutes"] == run1["total_payable_minutes"]

        # --- Acceptance Test 4: Gross/Net Reconciliation ---
        # Fetch full run with line items
        full_run = hr_client.get(f"/api/v1/payroll/runs/{run1['id']}").json()
        items = full_run["items"]
        assert len(items) == 1
        item = items[0]

        assert item["payable_minutes"] == 1025
        assert item["gross_pay"] == "4283.65"
        assert item["net_pay"] == "4283.65"
        assert item["watermark"] == "Draft - Not for payment"
        assert item["unresolved_exceptions_count"] == 0

        # Reconciliation preview check
        preview = hr_client.get(f"/api/v1/payroll/runs/{run1['id']}/preview").json()
        assert preview["reconciles"] is True
        assert preview["unresolved_exceptions_total"] == 0
        assert len(preview["blockers"]) == 0
