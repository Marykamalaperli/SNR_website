import os
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.main import create_app
from app.models.identity import Employee, Organization, RoleAssignment, Store, User
from app.models.identity import Session as AuthSession
from app.services.auth import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not DATABASE_URL, reason="PostgreSQL integration database unavailable"
)
ORIGIN = "http://localhost:5173"


@pytest.fixture
def seeded():
    engine = create_engine(DATABASE_URL)
    now = datetime.now(UTC)
    organization = Organization(
        id=uuid4(),
        name="Test organization",
        default_timezone="Asia/Kolkata",
        currency="INR",
        created_at=now,
    )
    store = Store(
        id=uuid4(),
        organization_id=organization.id,
        code="MAIN",
        name="Main store",
        timezone="Asia/Kolkata",
        created_at=now,
    )
    other_store = Store(
        id=uuid4(),
        organization_id=organization.id,
        code="OTHER",
        name="Other store",
        timezone="Asia/Kolkata",
        created_at=now,
    )
    active = User(
        id=uuid4(),
        email="active@example.org",
        display_name="Active Employee",
        password_hash=hash_password("correct horse battery staple"),
        status="active",
        token_version=1,
        created_at=now,
        updated_at=now,
    )
    inactive = User(
        id=uuid4(),
        email="inactive@example.org",
        display_name="Inactive Employee",
        password_hash=hash_password("correct horse battery staple"),
        status="deactivated",
        token_version=2,
        created_at=now,
        updated_at=now,
    )
    assignment = RoleAssignment(
        id=uuid4(),
        user_id=active.id,
        role="employee",
        organization_id=organization.id,
        store_id=store.id,
        active=True,
        created_at=now,
    )
    employee = Employee(
        id=uuid4(),
        organization_id=organization.id,
        home_store_id=store.id,
        user_id=active.id,
        employee_code="E001",
        display_name="Active Employee",
        status="active",
        hire_date=date(2026, 1, 1),
        created_at=now,
    )
    with Session(engine, expire_on_commit=False) as db:
        for model in (AuthSession, Employee, RoleAssignment, User, Store, Organization):
            db.execute(delete(model))
        db.add(organization)
        db.flush()
        db.add_all([store, other_store])
        db.flush()
        db.add_all([active, inactive])
        db.flush()
        db.add_all([assignment, employee])
        db.commit()
    yield engine, organization, store, other_store, active, inactive
    with Session(engine) as db:
        for model in (AuthSession, Employee, RoleAssignment, User, Store, Organization):
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


def test_login_me_refresh_rotation_logout_and_deactivation(seeded):
    _engine, organization, store, _other_store, _active, _inactive = seeded
    with app_client() as client:
        bad = client.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"email": "active@example.org", "password": "wrong-password"},
        )
        assert bad.status_code == 401
        assert bad.json()["error"]["code"] == "invalid_credentials"

        denied_origin = client.post(
            "/api/v1/auth/login",
            json={"email": "active@example.org", "password": "correct horse battery staple"},
        )
        assert denied_origin.status_code == 403

        login = client.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"email": "ACTIVE@example.org", "password": "correct horse battery staple"},
        )
        assert login.status_code == 200
        old_refresh = client.cookies.get("snr_refresh")
        assert "HttpOnly" in login.headers.get_list("set-cookie")[0]

        me = client.get("/api/v1/me")
        assert me.status_code == 200
        assert me.json()["scopes"] == [
            {
                "role": "employee",
                "organization_id": str(organization.id),
                "store_id": str(store.id),
            }
        ]

        refreshed = client.post("/api/v1/auth/refresh", headers={"Origin": ORIGIN})
        assert refreshed.status_code == 200
        assert client.cookies.get("snr_refresh") != old_refresh
        assert client.post("/api/v1/auth/logout", headers={"Origin": ORIGIN}).status_code == 200
        assert client.get("/api/v1/me").status_code == 401

        inactive = client.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"email": "inactive@example.org", "password": "correct horse battery staple"},
        )
        assert inactive.status_code == 401
        assert inactive.json()["error"]["code"] == "invalid_credentials"


def test_database_rejects_cross_organization_store_scope(seeded):
    engine, _organization, _store, other_store, active, _inactive = seeded
    now = datetime.now(UTC)
    second = Organization(
        id=uuid4(),
        name="Second organization",
        default_timezone="UTC",
        currency="USD",
        created_at=now,
    )
    with Session(engine) as db:
        db.add(second)
        db.commit()
        db.add(
            RoleAssignment(
                id=uuid4(),
                user_id=active.id,
                role="store_admin",
                organization_id=second.id,
                store_id=other_store.id,
                active=True,
                created_at=now,
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
