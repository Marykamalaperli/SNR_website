from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import Body
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.core.database import get_db_session, get_readiness_checker
from app.core.errors import DomainError
from app.core.security import require_current_user, require_role, require_scope
from app.main import create_app
from app.schemas.auth import CurrentUser, Scope
from app.services.auth import hash_password, verify_password

USER = UUID("00000000-0000-4000-8000-000000000001")
ORG = UUID("00000000-0000-4000-8000-000000000010")
STORE = UUID("00000000-0000-4000-8000-000000000020")
OTHER_STORE = UUID("00000000-0000-4000-8000-000000000021")


@pytest.fixture
def app():
    application = create_app(Settings(app_env="test", session_cookie_secure=False, database_url=""))
    application.dependency_overrides[get_db_session] = lambda: MagicMock()
    return application


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize("path", ["/health", "/api/v1/health"])
def test_health_is_meaningful_and_has_security_headers(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["cache-control"] == "no-store"
    UUID(response.headers["x-request-id"])


def test_readiness_requires_the_target_database(app, client):
    assert client.get("/api/v1/ready").status_code == 503

    class Ready:
        def check(self):
            return True

    app.dependency_overrides[get_readiness_checker] = Ready
    assert client.get("/api/v1/ready").json()["status"] == "ready"


def test_cors_allows_credentials_only_for_exact_origins(client):
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"
    denied = client.get("/health", headers={"Origin": "https://untrusted.example.org"})
    assert "access-control-allow-origin" not in denied.headers


def test_private_identity_endpoint_requires_session(client):
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


def test_me_returns_only_server_resolved_scope(app, client):
    current = CurrentUser(
        user_id=USER,
        email="employee@example.org",
        display_name="Employee",
        scopes=(Scope(role="employee", organization_id=ORG, store_id=STORE),),
    )
    app.dependency_overrides[require_current_user] = lambda: current
    response = client.get("/api/v1/me")
    assert response.status_code == 200
    assert response.json()["scopes"] == [
        {"role": "employee", "organization_id": str(ORG), "store_id": str(STORE)}
    ]


@pytest.mark.parametrize("role", ["employee", "store_admin"])
def test_employee_and_store_admin_cannot_cross_store(role):
    current = CurrentUser(
        user_id=USER,
        email=f"{role}@example.org",
        display_name=role,
        scopes=(Scope(role=role, organization_id=ORG, store_id=STORE),),
    )
    require_role(current, {role})
    require_scope(current, ORG, STORE, {role})
    with pytest.raises(DomainError):
        require_role(current, {"hr_payroll"})
    with pytest.raises(DomainError):
        require_scope(current, ORG, OTHER_STORE, {role})
    with pytest.raises(DomainError):
        require_scope(current, UUID("00000000-0000-4000-8000-000000000099"), STORE)


def test_system_admin_is_explicit_global_scope():
    admin = CurrentUser(
        user_id=USER,
        email="admin@example.org",
        display_name="Admin",
        scopes=(Scope(role="system_admin"),),
    )
    require_scope(admin, ORG, STORE, {"system_admin"})
    with pytest.raises(DomainError):
        require_role(admin, {"hr_payroll"})


def test_passwords_use_argon2id_and_wrong_values_fail():
    encoded = hash_password("correct horse battery staple")
    assert encoded.startswith("$argon2id$")
    assert verify_password(encoded, "correct horse battery staple")
    assert not verify_password(encoded, "incorrect value")


def test_validation_and_unexpected_errors_do_not_leak_input(app, client):
    @app.post("/test-validation")
    def validate(value: int = Body()):
        return value

    @app.get("/test-error")
    def fail():
        raise RuntimeError("secret-database-password")

    response = client.post("/test-validation", json="private-input")
    assert response.status_code == 422
    assert "private-input" not in response.text
    response = client.get("/test-error")
    assert response.status_code == 500
    assert "secret-database-password" not in response.text


@pytest.mark.parametrize(
    "kwargs",
    [
        {"cors_origins": ["*"]},
        {"app_env": "production", "cors_origins": ["http://example.org"]},
        {"allowed_hosts": ["*"]},
        {"database_url": "sqlite:///not-target.db"},
        {"access_session_minutes": 0},
        {"refresh_session_days": 31},
        {"app_env": "production", "session_cookie_secure": False},
    ],
)
def test_insecure_settings_are_rejected(kwargs):
    if kwargs.get("app_env") == "production":
        kwargs["database_url"] = "postgresql+psycopg://app:secret@db:5432/snr_nest"
        kwargs.setdefault("cors_origins", ["https://example.org"])
    with pytest.raises(ValidationError):
        Settings(**kwargs)


def test_untrusted_hosts_are_json_errors(client):
    response = client.get("/health", headers={"Host": "untrusted.example.org"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_host"
