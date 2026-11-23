import os
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
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
from app.models.payroll import (
    PayPeriod,
    PayrollConfiguration,
)
from app.services.auth import hash_password
from app.services.payroll import PayrollService

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


def test_payroll_day7_approval_payslips_and_downloads():
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
            name=f"Org Day7 {uid}",
            default_timezone="Asia/Kolkata",
            currency="INR",
            created_at=now,
        )
        store = Store(
            id=uuid4(),
            organization_id=org.id,
            code=f"STR-{uid[:4]}",
            name=f"Store Day7 {uid}",
            timezone="Asia/Kolkata",
            active=True,
            created_at=now,
        )
        db.add_all([org, store])
        db.flush()

        # 2. Users: HR, Employee A (Alice), Employee B (Bob)
        pw = "pw-12345678-strong"
        u_hr = User(
            id=uuid4(),
            email=f"hr_{uid}@dev.snrnest.org",
            password_hash=hash_password(pw),
            display_name=f"HR Lead {uid}",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        u_emp1 = User(
            id=uuid4(),
            email=f"emp1_{uid}@dev.snrnest.org",
            password_hash=hash_password(pw),
            display_name=f"Alice {uid}",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        u_emp2 = User(
            id=uuid4(),
            email=f"emp2_{uid}@dev.snrnest.org",
            password_hash=hash_password(pw),
            display_name=f"Bob {uid}",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        db.add_all([u_hr, u_emp1, u_emp2])
        db.flush()

        # Role assignments
        ra_hr = RoleAssignment(
            id=uuid4(),
            user_id=u_hr.id,
            organization_id=org.id,
            role="hr_payroll",
            created_at=now,
        )
        ra_emp1 = RoleAssignment(
            id=uuid4(),
            user_id=u_emp1.id,
            organization_id=org.id,
            store_id=store.id,
            role="employee",
            created_at=now,
        )
        ra_emp2 = RoleAssignment(
            id=uuid4(),
            user_id=u_emp2.id,
            organization_id=org.id,
            store_id=store.id,
            role="employee",
            created_at=now,
        )
        db.add_all([ra_hr, ra_emp1, ra_emp2])
        db.flush()

        # Employee profiles
        emp1 = Employee(
            id=uuid4(),
            organization_id=org.id,
            home_store_id=store.id,
            user_id=u_emp1.id,
            employee_code=f"E1_{uid}",
            display_name=f"Alice {uid}",
            status="active",
            hire_date=start_date,
            created_at=now,
        )
        emp2 = Employee(
            id=uuid4(),
            organization_id=org.id,
            home_store_id=store.id,
            user_id=u_emp2.id,
            employee_code=f"E2_{uid}",
            display_name=f"Bob {uid}",
            status="active",
            hire_date=start_date,
            created_at=now,
        )
        db.add_all([emp1, emp2])
        db.flush()

        # Rate configurations
        cfg1 = PayrollConfiguration(
            id=uuid4(),
            organization_id=org.id,
            employee_id=emp1.id,
            hourly_rate=Decimal("200.00"),
            effective_from=start_date,
            created_by=u_hr.id,
            created_at=now,
        )
        cfg2 = PayrollConfiguration(
            id=uuid4(),
            organization_id=org.id,
            employee_id=emp2.id,
            hourly_rate=Decimal("300.00"),
            effective_from=start_date,
            created_by=u_hr.id,
            created_at=now,
        )
        db.add_all([cfg1, cfg2])

        # Pay period
        period = PayPeriod(
            id=uuid4(),
            organization_id=org.id,
            name=f"Period Nov 1-15 {uid}",
            start_date=start_date,
            end_date=end_date,
            cutoff_date=cutoff_date,
            status="open",
            created_at=now,
            updated_at=now,
        )
        db.add(period)

        # Attendance day for Alice: 480 minutes (8 hrs) -> 8 * 200 = 1600.00
        day1 = AttendanceDay(
            id=uuid4(),
            organization_id=org.id,
            store_id=store.id,
            employee_id=emp1.id,
            work_date=start_date,
            payable_minutes=480,
            status="present",
            is_missing_punch=False,
            version=1,
            created_at=now,
            updated_at=now,
        )
        # Attendance day for Bob: 600 minutes (10 hrs) -> 10 * 300 = 3000.00
        day2 = AttendanceDay(
            id=uuid4(),
            organization_id=org.id,
            store_id=store.id,
            employee_id=emp2.id,
            work_date=start_date,
            payable_minutes=600,
            status="present",
            is_missing_punch=False,
            version=1,
            created_at=now,
            updated_at=now,
        )
        db.add_all([day1, day2])
        db.commit()

        # Initialize clients & log in
        c_hr = TestClient(app)
        c_emp1 = TestClient(app)
        c_emp2 = TestClient(app)

        r = c_hr.post(
            "/api/v1/auth/login",
            json={"email": u_hr.email, "password": pw},
            headers={"Origin": ORIGIN},
        )
        assert r.status_code == 200

        r = c_emp1.post(
            "/api/v1/auth/login",
            json={"email": u_emp1.email, "password": pw},
            headers={"Origin": ORIGIN},
        )
        assert r.status_code == 200

        r = c_emp2.post(
            "/api/v1/auth/login",
            json={"email": u_emp2.email, "password": pw},
            headers={"Origin": ORIGIN},
        )
        assert r.status_code == 200

        # Step 1: Calculate Draft Run
        calc_res = c_hr.post(
            "/api/v1/payroll/runs/calculate-draft",
            json={"pay_period_id": str(period.id)},
        )
        assert calc_res.status_code == 201, calc_res.text
        run_data = calc_res.json()
        run_id = run_data["id"]
        assert run_data["status"] == "draft"

        # --- Acceptance Test 3: Unreleased payslip is completely hidden ---
        # Before approval/release, employees cannot see any payslips
        r_emp1_slips = c_emp1.get("/api/v1/payslips/me")
        assert r_emp1_slips.status_code == 200
        assert len(r_emp1_slips.json()) == 0

        # Step 2: Validate Run
        val_res = c_hr.post(f"/api/v1/payroll/runs/{run_id}/validate")
        assert val_res.status_code == 200
        assert val_res.json()["reconciles"] is True

        # Step 3: Approve and Lock Run
        approve_res = c_hr.post(
            f"/api/v1/payroll/runs/{run_id}/approve",
            json={"notes": "Final approval by authorized HR"},
        )
        assert approve_res.status_code == 200, approve_res.text
        locked_run = approve_res.json()
        assert locked_run["status"] == "locked"
        assert locked_run["locked_at"] is not None

        # --- Acceptance Test 1: Locked run cannot mutate ---
        # Attempt to re-approve fails with 409 Conflict
        re_approve = c_hr.post(
            f"/api/v1/payroll/runs/{run_id}/approve",
            json={"notes": "Second attempt"},
        )
        assert re_approve.status_code == 409
        assert "cannot be modified" in re_approve.json()["error"]["message"]

        # --- Acceptance Test 5: Approval logged in audit trail ---
        audit_res = c_hr.get(f"/api/v1/payroll/audit-logs?payroll_run_id={run_id}")
        assert audit_res.status_code == 200
        logs = audit_res.json()
        assert any(entry["action"] == "approved" for entry in logs)

        # Payslips are generated but still "generated" (unreleased)
        # Check employee still sees nothing in /payslips/me
        r_emp1_slips2 = c_emp1.get("/api/v1/payslips/me")
        assert len(r_emp1_slips2.json()) == 0

        # Step 4: Release Payslips
        release_res = c_hr.post(f"/api/v1/payroll/runs/{run_id}/release")
        assert release_res.status_code == 200
        released_slips = release_res.json()
        assert len(released_slips) == 2
        for s in released_slips:
            assert s["status"] == "released"
            assert s["released_at"] is not None

        # --- Acceptance Test 5: Release action logged in audit trail ---
        audit_res2 = c_hr.get(f"/api/v1/payroll/audit-logs?payroll_run_id={run_id}")
        logs2 = audit_res2.json()
        assert any(entry["action"] == "released" for entry in logs2)

        # Step 5: Employee sees own released payslip now
        emp1_view = c_emp1.get("/api/v1/payslips/me").json()
        assert len(emp1_view) == 1
        alice_slip = emp1_view[0]
        assert alice_slip["employee_id"] == str(emp1.id)
        assert alice_slip["gross_pay"] == "1600.00"
        assert alice_slip["net_pay"] == "1600.00"

        emp2_view = c_emp2.get("/api/v1/payslips/me").json()
        assert len(emp2_view) == 1
        bob_slip = emp2_view[0]
        assert bob_slip["employee_id"] == str(emp2.id)
        assert bob_slip["gross_pay"] == "3000.00"

        # --- Acceptance Test 2: Employee cannot access another employee's payslip ---
        # Alice tries to create a download intent for Bob's payslip -> must be 403 Forbidden
        cross_res = c_emp1.post(f"/api/v1/payslips/{bob_slip['id']}/download-intent")
        assert cross_res.status_code == 403
        assert "cannot access this payslip" in cross_res.json()["error"]["message"]

        # Step 6: Alice requests download intent for own payslip
        intent_res = c_emp1.post(f"/api/v1/payslips/{alice_slip['id']}/download-intent")
        assert intent_res.status_code == 200
        intent_data = intent_res.json()
        assert "download_url" in intent_data
        download_url = intent_data["download_url"]

        # Alice downloads PDF using signed token
        dl_res = c_emp1.get(download_url)
        assert dl_res.status_code == 200
        assert dl_res.headers["content-type"] == "application/pdf"
        assert dl_res.content.startswith(b"%PDF-1.4")
        assert b"Alice" in dl_res.content or b"1600" in dl_res.content

        # --- Acceptance Test 4: Signed URL expires & tamper check ---
        # Tampered token
        tampered_url = download_url + "tampered"
        tampered_res = c_emp1.get(tampered_url)
        assert tampered_res.status_code == 401

        # Expired token: create expired token manually and verify rejection
        service = PayrollService(db, settings)
        expired_intent = service.create_download_intent(ra_emp1, u_emp1.id, alice_slip["id"])
        # Token has timestamp in past:
        parts = expired_intent.download_url.split("/")[-1].split(":")
        past_ts = str(int((now - timedelta(minutes=10)).timestamp()))
        raw_payload = f"{parts[0]}:{past_ts}:{parts[2]}"
        import base64
        import hashlib
        import hmac

        sig = hmac.new(
            settings.qr_signing_secret.encode(), raw_payload.encode(), hashlib.sha256
        ).digest()
        sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
        expired_token = f"{raw_payload}:{sig_b64}"

        expired_res = c_emp1.get(f"/api/v1/payslips/download/{expired_token}")
        assert expired_res.status_code == 401
        assert "expired" in expired_res.json()["error"]["message"]
