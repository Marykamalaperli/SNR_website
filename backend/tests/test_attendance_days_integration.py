import os
from datetime import UTC, date, datetime, time, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
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
from app.models.workforce import Shift, ShiftAssignment
from app.services.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


def test_attendance_days_and_adjustment_workflow():
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
        today = date(2026, 11, 23)

        org = Organization(
            id=uuid4(),
            name=f"Org Days {uid}",
            default_timezone="Asia/Kolkata",
            currency="INR",
            created_at=now,
        )
        db.add(org)
        db.flush()

        store1 = Store(
            id=uuid4(),
            organization_id=org.id,
            code=f"S1_{uid}",
            name="Store 1",
            timezone="Asia/Kolkata",
            created_at=now,
        )
        store2 = Store(
            id=uuid4(),
            organization_id=org.id,
            code=f"S2_{uid}",
            name="Store 2",
            timezone="Asia/Kolkata",
            created_at=now,
        )
        db.add_all([store1, store2])
        db.flush()

        # Users
        u_emp = User(
            id=uuid4(),
            email=f"emp_{uid}@dev.example.org",
            display_name="Test Employee",
            password_hash=hash_password("pw-12345678-strong"),
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        u_sa1 = User(
            id=uuid4(),
            email=f"sa1_{uid}@dev.example.org",
            display_name="Store Admin 1",
            password_hash=hash_password("pw-12345678-strong"),
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        u_sa2 = User(
            id=uuid4(),
            email=f"sa2_{uid}@dev.example.org",
            display_name="Store Admin 2",
            password_hash=hash_password("pw-12345678-strong"),
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        u_hr = User(
            id=uuid4(),
            email=f"hr_{uid}@dev.example.org",
            display_name="HR Admin",
            password_hash=hash_password("pw-12345678-strong"),
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        db.add_all([u_emp, u_sa1, u_sa2, u_hr])
        db.flush()

        # Role assignments
        ra_emp = RoleAssignment(
            id=uuid4(),
            user_id=u_emp.id,
            role="employee",
            organization_id=org.id,
            store_id=store1.id,
            active=True,
            created_at=now,
        )
        ra_sa1 = RoleAssignment(
            id=uuid4(),
            user_id=u_sa1.id,
            role="store_admin",
            organization_id=org.id,
            store_id=store1.id,
            active=True,
            created_at=now,
        )
        ra_sa2 = RoleAssignment(
            id=uuid4(),
            user_id=u_sa2.id,
            role="store_admin",
            organization_id=org.id,
            store_id=store2.id,
            active=True,
            created_at=now,
        )
        ra_hr = RoleAssignment(
            id=uuid4(),
            user_id=u_hr.id,
            role="hr_payroll",
            organization_id=org.id,
            store_id=None,
            active=True,
            created_at=now,
        )
        db.add_all([ra_emp, ra_sa1, ra_sa2, ra_hr])
        db.flush()

        # Employee profile
        employee = Employee(
            id=uuid4(),
            organization_id=org.id,
            home_store_id=store1.id,
            user_id=u_emp.id,
            employee_code=f"EMP_{uid}",
            display_name="Test Employee",
            status="active",
            hire_date=today,
            created_at=now,
        )
        db.add(employee)
        db.flush()

        # Shift: 09:00 to 18:00
        shift = Shift(
            id=uuid4(),
            organization_id=org.id,
            store_id=store1.id,
            code=f"SH_{uid}",
            name="General Shift",
            start_time=time(9, 0),
            end_time=time(18, 0),
            break_minutes=60,
            is_overnight=False,
            created_at=now,
            updated_at=now,
        )
        db.add(shift)
        db.flush()

        # Shift assignment
        sa_rec = ShiftAssignment(
            id=uuid4(),
            organization_id=org.id,
            employee_id=employee.id,
            shift_id=shift.id,
            effective_from=today - timedelta(days=5),
            effective_until=today + timedelta(days=5),
            created_at=now,
            created_by=u_sa1.id,
        )
        db.add(sa_rec)

        db.commit()

        try:
            # Client sessions
            c_emp = TestClient(app)
            c_sa1 = TestClient(app)
            c_sa2 = TestClient(app)
            c_hr = TestClient(app)

            # Logins
            r = c_emp.post(
                "/api/v1/auth/login",
                json={"email": u_emp.email, "password": "pw-12345678-strong"},
                headers={"Origin": ORIGIN},
            )
            assert r.status_code == 200

            r = c_sa1.post(
                "/api/v1/auth/login",
                json={"email": u_sa1.email, "password": "pw-12345678-strong"},
                headers={"Origin": ORIGIN},
            )
            assert r.status_code == 200

            r = c_sa2.post(
                "/api/v1/auth/login",
                json={"email": u_sa2.email, "password": "pw-12345678-strong"},
                headers={"Origin": ORIGIN},
            )
            assert r.status_code == 200

            r = c_hr.post(
                "/api/v1/auth/login",
                json={"email": u_hr.email, "password": "pw-12345678-strong"},
                headers={"Origin": ORIGIN},
            )
            assert r.status_code == 200

            # 1. Issue challenge by Store Admin 1
            r_ch = c_sa1.post(f"/api/v1/attendance/challenges/issue?store_id={store1.id}")
            assert r_ch.status_code == 200
            token1 = r_ch.json()["challenge_token"]

            # 2. Employee clocks in
            r_punch1 = c_emp.post(
                "/api/v1/attendance/events",
                json={
                    "challenge_token": token1,
                    "action": "clock_in",
                    "photo_key": f"evidence/{org.id}/{store1.id}/photo1.jpg",
                },
                headers={"Idempotency-Key": f"idemp-in-{uid}"},
            )
            assert r_punch1.status_code == 201

            # 3. Check derived AttendanceDay
            # (first_in is set, missing_punch is true because not yet clocked out)
            r_days = c_sa1.get(f"/api/v1/attendance/days?store_id={store1.id}")
            assert r_days.status_code == 200
            days = r_days.json()["items"]
            assert len(days) >= 1
            day1 = next(d for d in days if d["employee_id"] == str(employee.id))
            assert day1["status"] == "missing_punch"
            assert day1["is_missing_punch"] is True
            assert day1["first_in"] is not None
            assert day1["last_out"] is None
            assert day1["version"] == 1

            # Employee can see own day
            r_my_days = c_emp.get("/api/v1/attendance/me/days")
            assert r_my_days.status_code == 200
            assert any(d["id"] == day1["id"] for d in r_my_days.json()["items"])

            # Store Admin 2 cannot see Store 1's days
            r_sa2_days = c_sa2.get(f"/api/v1/attendance/days?store_id={store1.id}")
            assert r_sa2_days.status_code == 403

            # 4. Issue second challenge and Employee clocks out
            r_ch2 = c_sa1.post(f"/api/v1/attendance/challenges/issue?store_id={store1.id}")
            token2 = r_ch2.json()["challenge_token"]

            r_punch2 = c_emp.post(
                "/api/v1/attendance/events",
                json={
                    "challenge_token": token2,
                    "action": "clock_out",
                    "photo_key": f"evidence/{org.id}/{store1.id}/photo2.jpg",
                },
                headers={"Idempotency-Key": f"idemp-out-{uid}"},
            )
            assert r_punch2.status_code == 201

            # Check day summary after clock out
            day_obj = c_sa1.get(f"/api/v1/attendance/days/{day1['id']}").json()
            assert day_obj["first_in"] is not None
            assert day_obj["last_out"] is not None
            assert day_obj["status"] == "present"
            assert day_obj["is_missing_punch"] is False

            # 5. Optimistic Concurrency test on adjustment
            # Submitting with wrong version returns 409
            stale_payload = {
                "first_in": "2026-11-23T09:00:00Z",
                "last_out": "2026-11-23T18:00:00Z",
                "reason": "Correcting punch times",
                "expected_version": 999,
            }
            r_conflict = c_sa1.post(
                f"/api/v1/attendance/days/{day1['id']}/adjustments",
                json=stale_payload,
            )
            assert r_conflict.status_code == 409
            assert r_conflict.json()["error"]["code"] == "conflict"

            # 6. Store Admin 1 submits adjustment request (pending approval)
            correct_payload = {
                "first_in": "2026-11-23T09:00:00Z",
                "last_out": "2026-11-23T18:00:00Z",
                "reason": "Employee forgot to clock out at shift end",
                "expected_version": day_obj["version"],
            }
            r_adj = c_sa1.post(
                f"/api/v1/attendance/days/{day1['id']}/adjustments",
                json=correct_payload,
            )
            assert r_adj.status_code == 201
            adj = r_adj.json()
            assert adj["status"] == "pending_approval"
            assert adj["reason"] == "Employee forgot to clock out at shift end"
            assert adj["before_json"]["version"] == day_obj["version"]

            # Store Admin cannot review/approve adjustments
            r_unauth_review = c_sa1.post(
                f"/api/v1/attendance/adjustments/{adj['id']}/review",
                json={"action": "approve", "review_note": "Approved by store admin"},
            )
            assert r_unauth_review.status_code == 403

            # 7. HR reviews and approves adjustment
            r_review = c_hr.post(
                f"/api/v1/attendance/adjustments/{adj['id']}/review",
                json={"action": "approve", "review_note": "Verified with store manager logs"},
            )
            assert r_review.status_code == 200
            assert r_review.json()["status"] == "approved"
            assert r_review.json()["approved_by"] == str(u_hr.id)

            # 8. Verify AttendanceDay was updated transactionally
            day_after = c_hr.get(f"/api/v1/attendance/days/{day1['id']}").json()
            assert day_after["status"] == "adjusted"
            assert day_after["payable_minutes"] == 540  # 9 hours = 540 minutes
            assert day_after["version"] == day_obj["version"] + 1

            # 9. Verify raw attendance events remain completely unchanged (immutable)
            raw_events = c_hr.get(f"/api/v1/attendance/events?employee_id={employee.id}").json()[
                "items"
            ]
            assert len(raw_events) == 2  # exactly the 2 raw punches remain unmodified

        finally:
            # Clean up
            db.query(AttendanceAdjustment).filter(
                AttendanceAdjustment.organization_id == org.id
            ).delete()
            db.query(AttendanceDay).filter(AttendanceDay.organization_id == org.id).delete()
            db.query(AttendanceAuditLog).filter(
                AttendanceAuditLog.organization_id == org.id
            ).delete()
            db.query(AttendanceEvent).filter(AttendanceEvent.organization_id == org.id).delete()
            db.query(AttendanceChallenge).filter(
                AttendanceChallenge.organization_id == org.id
            ).delete()
            db.query(ShiftAssignment).filter(ShiftAssignment.organization_id == org.id).delete()
            db.query(Employee).filter(Employee.organization_id == org.id).delete()
            db.query(Shift).filter(Shift.organization_id == org.id).delete()
            db.query(RoleAssignment).filter(RoleAssignment.organization_id == org.id).delete()
            db.query(AuthSession).filter(
                AuthSession.user_id.in_([u_emp.id, u_sa1.id, u_sa2.id, u_hr.id])
            ).delete()
            db.query(User).filter(User.id.in_([u_emp.id, u_sa1.id, u_sa2.id, u_hr.id])).delete()
            db.query(Store).filter(Store.organization_id == org.id).delete()
            db.query(Organization).filter(Organization.id == org.id).delete()
            db.commit()
