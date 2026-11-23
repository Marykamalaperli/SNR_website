"""Store management integration tests.

Verifies that System Admin (Super Admin) can create, list, and update stores,
and that non-system_admin roles are rejected with 403 Forbidden.
"""

import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import create_database_engine
from app.main import create_app
from app.models.identity import (
    Organization,
    RoleAssignment,
    Store,
    User,
)
from app.models.identity import (
    Session as AuthSession,
)
from app.services.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


def test_system_admin_store_management_lifecycle() -> None:
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
    pwd_raw = "TestingSecurePass123!"
    pwd_hash = hash_password(pwd_raw)
    now = datetime.now(UTC)

    u_sys_id = uuid4()
    u_emp_id = uuid4()

    with Session(engine) as db:
        org = Organization(
            id=org_id,
            name=f"Store Test Org {uid}",
            default_timezone="Asia/Kolkata",
            currency="INR",
            created_at=now,
        )
        db.add(org)
        db.flush()

        user_sys = User(
            id=u_sys_id,
            email=f"sys_{uid}@dev.example.org",
            password_hash=pwd_hash,
            display_name="System Admin User",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        user_emp = User(
            id=u_emp_id,
            email=f"emp_{uid}@dev.example.org",
            password_hash=pwd_hash,
            display_name="Employee User",
            status="active",
            token_version=1,
            created_at=now,
            updated_at=now,
        )
        db.add_all([user_sys, user_emp])
        db.flush()

        # Create initial store so employee can be bound to it
        init_store = Store(
            id=uuid4(),
            organization_id=org_id,
            code=f"INI-{uid[:4]}",
            name="Initial Store",
            timezone="Asia/Kolkata",
            active=True,
            created_at=now,
        )
        db.add(init_store)
        db.flush()

        ra_sys = RoleAssignment(
            id=uuid4(),
            user_id=u_sys_id,
            role="system_admin",
            organization_id=None,
            store_id=None,
            active=True,
            created_at=now,
        )
        ra_emp = RoleAssignment(
            id=uuid4(),
            user_id=u_emp_id,
            role="employee",
            organization_id=org_id,
            store_id=init_store.id,
            active=True,
            created_at=now,
        )
        db.add_all([ra_sys, ra_emp])
        db.commit()

    created_store_ids = []

    try:

        def login_client(email: str) -> TestClient:
            c = TestClient(app)
            r = c.post(
                "/api/v1/auth/login",
                json={"email": email, "password": pwd_raw},
                headers={"Origin": ORIGIN},
            )
            assert r.status_code == 200, f"Login failed: {r.text}"
            return c

        client_sys = login_client(f"sys_{uid}@dev.example.org")
        client_emp = login_client(f"emp_{uid}@dev.example.org")

        # 1. Non-admin (Employee) CANNOT create store (403 Forbidden)
        res_emp = client_emp.post(
            "/api/v1/stores",
            json={
                "code": f"STR-{uid[:4]}",
                "name": "Emp Attempt Store",
                "timezone": "Asia/Kolkata",
            },
            headers={"Origin": ORIGIN},
        )
        assert res_emp.status_code == 403

        # 2. System Admin CAN create store (201 Created)
        store_code = f"BLR-{uid[:4]}"
        res_sys = client_sys.post(
            f"/api/v1/stores?organization_id={org_id}",
            json={
                "code": store_code,
                "name": "Bangalore Flagship Store",
                "timezone": "Asia/Kolkata",
            },
            headers={"Origin": ORIGIN},
        )
        assert res_sys.status_code == 201
        store_data = res_sys.json()
        assert store_data["code"] == store_code.upper()
        assert store_data["name"] == "Bangalore Flagship Store"
        assert store_data["timezone"] == "Asia/Kolkata"
        assert store_data["active"] is True
        created_store_ids.append(store_data["id"])

        # 3. Duplicate store code in same org returns 409 Conflict
        res_dup = client_sys.post(
            f"/api/v1/stores?organization_id={org_id}",
            json={"code": store_code, "name": "Duplicate Code Store", "timezone": "Asia/Kolkata"},
            headers={"Origin": ORIGIN},
        )
        assert res_dup.status_code == 409

        # 4. System Admin can list stores
        res_list = client_sys.get(
            f"/api/v1/stores?organization_id={org_id}",
            headers={"Origin": ORIGIN},
        )
        assert res_list.status_code == 200
        list_data = res_list.json()
        assert list_data["total"] >= 1
        assert any(s["id"] == store_data["id"] for s in list_data["items"])

        # 5. System Admin can update store
        res_update = client_sys.patch(
            f"/api/v1/stores/{store_data['id']}",
            json={"name": "Bangalore Central Flagship", "active": True},
            headers={"Origin": ORIGIN},
        )
        assert res_update.status_code == 200
        assert res_update.json()["name"] == "Bangalore Central Flagship"

        # 6. Non-admin (Employee) CANNOT create store admin (403 Forbidden)
        admin_email = f"mgr_{uid}@dev.example.org"
        res_adm_emp = client_emp.post(
            f"/api/v1/stores/{store_data['id']}/admins",
            json={"email": admin_email, "display_name": "Store Manager 1", "password": pwd_raw},
            headers={"Origin": ORIGIN},
        )
        assert res_adm_emp.status_code == 403

        # 7. System Admin CAN create store admin for store (201 Created)
        res_adm_sys = client_sys.post(
            f"/api/v1/stores/{store_data['id']}/admins",
            json={"email": admin_email, "display_name": "Store Manager 1", "password": pwd_raw},
            headers={"Origin": ORIGIN},
        )
        assert res_adm_sys.status_code == 201
        adm_data = res_adm_sys.json()
        assert adm_data["email"] == admin_email
        assert adm_data["role"] == "store_admin"
        assert adm_data["store_id"] == store_data["id"]

        # 8. System Admin can list store admins for store
        res_list_admins = client_sys.get(
            f"/api/v1/stores/{store_data['id']}/admins",
            headers={"Origin": ORIGIN},
        )
        assert res_list_admins.status_code == 200
        admins_data = res_list_admins.json()
        assert admins_data["total"] >= 1
        assert any(a["email"] == admin_email for a in admins_data["items"])

        # 9. Newly created Store Admin can log in successfully
        client_mgr = login_client(admin_email)
        res_me = client_mgr.get("/api/v1/me")
        assert res_me.status_code == 200
        me_data = res_me.json()
        assert me_data["email"] == admin_email
        assert any(
            s["role"] == "store_admin" and s["store_id"] == store_data["id"]
            for s in me_data["scopes"]
        )

    finally:
        with Session(engine) as db:
            from sqlalchemy import select

            mgr_user = db.scalar(select(User).where(User.email == f"mgr_{uid}@dev.example.org"))
            user_ids_to_del = [u_sys_id, u_emp_id]
            if mgr_user:
                user_ids_to_del.append(mgr_user.id)
            db.execute(delete(RoleAssignment).where(RoleAssignment.user_id.in_(user_ids_to_del)))
            db.execute(delete(AuthSession).where(AuthSession.user_id.in_(user_ids_to_del)))
            db.execute(delete(Store).where(Store.organization_id == org_id))
            db.execute(delete(User).where(User.id.in_(user_ids_to_del)))
            db.execute(delete(Organization).where(Organization.id == org_id))
            db.commit()
