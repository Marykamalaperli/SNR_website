import os
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
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
from app.services.reports import sanitize_csv_cell

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


def test_sanitize_csv_cell_neutralization():
    """Verify formula injection triggers are properly escaped."""
    assert sanitize_csv_cell("=cmd|'/C calc'!A0") == "'=cmd|'/C calc'!A0"
    assert sanitize_csv_cell("+12345") == "'+12345"
    assert sanitize_csv_cell("-100.50") == "'-100.50"
    assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
    assert sanitize_csv_cell("\tTabbed") == "'\tTabbed"
    assert sanitize_csv_cell("\rReturn") == "'\rReturn"
    assert sanitize_csv_cell("Normal Text") == "Normal Text"
    assert sanitize_csv_cell(1234) == "1234"
    assert sanitize_csv_cell(None) == ""


def test_reports_day8_attendance_and_payroll_csv_exports():
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

        # 1. Organization & Stores
        org = Organization(
            id=uuid4(),
            name=f"Org Reports {uid}",
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

        # 2. Users & Roles
        pwd_hash = hash_password("test-pass-123!")

        hr_user = User(
            id=uuid4(),
            email=f"hr_{uid}@dev.example.org",
            display_name=f"HR {uid}",
            password_hash=pwd_hash,
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        sa_user = User(
            id=uuid4(),
            email=f"sa_{uid}@dev.example.org",
            display_name=f"SA {uid}",
            password_hash=pwd_hash,
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        emp_user = User(
            id=uuid4(),
            email=f"emp_{uid}@dev.example.org",
            display_name="=DANGEROUS_USER",
            password_hash=pwd_hash,
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        db.add_all([hr_user, sa_user, emp_user])
        db.flush()

        ra_hr = RoleAssignment(
            id=uuid4(),
            user_id=hr_user.id,
            role="hr_payroll",
            organization_id=org.id,
            store_id=None,
            created_at=now,
        )
        ra_sa = RoleAssignment(
            id=uuid4(),
            user_id=sa_user.id,
            role="store_admin",
            organization_id=org.id,
            store_id=store.id,
            created_at=now,
        )
        ra_emp = RoleAssignment(
            id=uuid4(),
            user_id=emp_user.id,
            role="employee",
            organization_id=org.id,
            store_id=store.id,
            created_at=now,
        )
        emp = Employee(
            id=uuid4(),
            organization_id=org.id,
            user_id=emp_user.id,
            employee_code=f"@EMP-{uid[:4]}",  # Dangerous prefix
            display_name="=DANGEROUS_USER",  # Dangerous prefix
            home_store_id=store.id,
            status="active",
            hire_date=start_date,
            created_at=now,
        )
        db.add_all([ra_hr, ra_sa, ra_emp, emp])
        db.flush()

        # 3. Attendance Days
        att_day = AttendanceDay(
            id=uuid4(),
            organization_id=org.id,
            store_id=store.id,
            employee_id=emp.id,
            work_date=start_date,
            first_in=datetime(2026, 11, 1, 9, 0, tzinfo=UTC),
            last_out=datetime(2026, 11, 1, 17, 30, tzinfo=UTC),
            payable_minutes=510,
            is_missing_punch=False,
            is_late=False,
            is_early_departure=False,
            is_overtime=False,
            status="present",
            version=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        period = PayPeriod(
            id=uuid4(),
            organization_id=org.id,
            name=f"Period Nov {uid}",
            start_date=start_date,
            end_date=end_date,
            cutoff_date=end_date + timedelta(days=2),
            status="open",
            created_at=now,
            updated_at=now,
        )
        cfg = PayrollConfiguration(
            id=uuid4(),
            organization_id=org.id,
            employee_id=emp.id,
            hourly_rate=Decimal("150.00"),
            effective_from=start_date - timedelta(days=30),
            created_by=hr_user.id,
            created_at=now,
        )
        db.add_all([att_day, period, cfg])
        db.commit()

        client = TestClient(app, base_url="http://testserver")

        try:
            # -------------------------------------------------------------
            # TEST 1: HR logs in and calculates draft run
            # -------------------------------------------------------------
            login_hr = client.post(
                "/api/v1/auth/login",
                json={"email": f"hr_{uid}@dev.example.org", "password": "test-pass-123!"},
                headers={"Origin": ORIGIN},
            )
            assert login_hr.status_code == 200

            calc_resp = client.post(
                "/api/v1/payroll/runs/calculate-draft",
                json={"pay_period_id": str(period.id)},
                headers={"Origin": ORIGIN},
            )
            assert calc_resp.status_code == 201
            run_data = calc_resp.json()
            run_id = run_data["id"]
            assert run_data["status"] == "draft"

            # -------------------------------------------------------------
            # TEST 2: HR can download Attendance CSV report
            # -------------------------------------------------------------
            resp_att = client.get(
                f"/api/v1/reports/attendance.csv?from_date={start_date}&to_date={end_date}&store_id={store.id}",
                headers={"Origin": ORIGIN},
            )
            assert resp_att.status_code == 200
            assert resp_att.headers["content-type"].startswith("text/csv")
            assert (
                f"attendance-report-{start_date}-to-{end_date}.csv"
                in resp_att.headers["content-disposition"]
            )
            csv_lines = resp_att.text.strip().splitlines()
            assert "# SNR NEST Attendance Export" in csv_lines[0]
            assert "Work Date,Store Code,Store Name" in csv_lines[1]
            data_row = [line for line in csv_lines if f"STR-{uid[:4]}" in line][0]
            assert f"'@EMP-{uid[:4]}" in data_row
            assert "'=DANGEROUS_USER" in data_row

            # -------------------------------------------------------------
            # TEST 3: HR can download Payroll CSV report with draft watermark
            # -------------------------------------------------------------
            resp_pay = client.get(
                f"/api/v1/reports/payroll.csv?payroll_run_id={run_id}",
                headers={"Origin": ORIGIN},
            )
            if resp_pay.status_code != 200:
                print("PAY ERROR:", resp_pay.status_code, resp_pay.text)
            assert resp_pay.status_code == 200
            assert resp_pay.headers["content-type"].startswith("text/csv")
            assert f"payroll-run-{run_id}.csv" in resp_pay.headers["content-disposition"]
            pay_lines = resp_pay.text.strip().splitlines()
            assert "# WATERMARK: Draft - Not for payment" in pay_lines[0]
            assert "Run ID,Period Start,Period End" in pay_lines[2]
            pay_row = [
                line for line in pay_lines if not line.startswith("#") and str(run_id) in line
            ][0]
            assert f"'@EMP-{uid[:4]}" in pay_row
            assert "'=DANGEROUS_USER" in pay_row
            assert "INR" in pay_row

            # -------------------------------------------------------------
            # TEST 4: Store Admin can download Attendance CSV, but NOT Payroll CSV
            # -------------------------------------------------------------
            login_sa = client.post(
                "/api/v1/auth/login",
                json={"email": f"sa_{uid}@dev.example.org", "password": "test-pass-123!"},
                headers={"Origin": ORIGIN},
            )
            assert login_sa.status_code == 200

            resp_sa_att = client.get(
                f"/api/v1/reports/attendance.csv?from_date={start_date}&to_date={end_date}",
                headers={"Origin": ORIGIN},
            )
            assert resp_sa_att.status_code == 200

            resp_sa_pay = client.get(
                f"/api/v1/reports/payroll.csv?payroll_run_id={run_id}",
                headers={"Origin": ORIGIN},
            )
            assert resp_sa_pay.status_code == 403

            # -------------------------------------------------------------
            # TEST 5: Employee is forbidden from downloading any reports
            # -------------------------------------------------------------
            login_emp = client.post(
                "/api/v1/auth/login",
                json={"email": f"emp_{uid}@dev.example.org", "password": "test-pass-123!"},
                headers={"Origin": ORIGIN},
            )
            assert login_emp.status_code == 200

            resp_emp_att = client.get(
                f"/api/v1/reports/attendance.csv?from_date={start_date}&to_date={end_date}",
                headers={"Origin": ORIGIN},
            )
            assert resp_emp_att.status_code == 403

            resp_emp_pay = client.get(
                f"/api/v1/reports/payroll.csv?payroll_run_id={run_id}",
                headers={"Origin": ORIGIN},
            )
            assert resp_emp_pay.status_code == 403

        finally:
            # Clean teardown in reverse dependency order
            for model in (
                Payslip,
                PayrollAuditLog,
                PayrollItem,
                PayrollRun,
                PayrollConfiguration,
                PayPeriod,
                AttendanceAdjustment,
                AttendanceAuditLog,
                AttendanceDay,
                AttendanceEvent,
                Employee,
                RoleAssignment,
                Store,
                Organization,
                AuthSession,
                User,
            ):
                db.execute(delete(model))
            db.commit()
