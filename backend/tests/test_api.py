from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Body
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import DomainError
from app.core.security import require_identity, require_organization, require_role
from app.main import create_app
from app.schemas.session import Identity, Membership
from app.services.memberships import get_membership_repository

USER = UUID("00000000-0000-4000-8000-000000000001")
ORG = UUID("00000000-0000-4000-8000-000000000010")
ISSUER = "https://auth.example.org/auth/v1"
JWKS = "https://auth.example.org/auth/v1/.well-known/jwks.json"


@pytest.fixture
def app():
    return create_app(Settings(app_env="test"))


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("path", ["/health", "/api/v1/health"])
def test_health_is_meaningful_and_has_security_headers(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "snr-nest-api"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    UUID(response.headers["x-request-id"])


def test_correlations_are_propagated_or_sanitized(client):
    response = client.get("/health", headers={"X-Request-ID": "client-request_123"})
    assert response.headers["x-request-id"] == "client-request_123"
    response = client.get("/not-found", headers={"X-Request-ID": "untrusted<script>"})
    assert response.status_code == 404
    request_id = response.headers["x-request-id"]
    UUID(request_id)
    assert response.json()["error"]["request_id"] == request_id


def test_cors_allows_only_configured_origins(client):
    response = client.options(
        "/api/v1/session",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in response.headers
    denied = client.get("/health", headers={"Origin": "https://untrusted.example.org"})
    assert "access-control-allow-origin" not in denied.headers


def test_untrusted_hosts_are_json_errors(client):
    response = client.get("/health", headers={"Host": "untrusted.example.org"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_host"


def test_unfinished_domain_endpoints_do_not_return_fake_data(client):
    for path in ["/api/v1/employees", "/api/v1/attendance", "/api/v1/documents"]:
        assert client.get(path).status_code == 404


def test_session_requires_identity_and_configured_auth(client):
    assert client.get("/api/v1/session").status_code == 401
    response = client.get("/api/v1/session", headers={"Authorization": "Bearer sample"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "auth_unavailable"


def test_verified_identity_does_not_grant_membership(app, client):
    app.dependency_overrides[require_identity] = lambda: Identity(user_id=USER)
    response = client.get("/api/v1/session")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "authorization_unavailable"


def test_trusted_membership_adapter_is_explicit(app, client):
    class TestRepository:
        def resolve(self, identity):
            return Membership(user_id=identity.user_id, organization_id=ORG, role="employee")

    app.dependency_overrides[require_identity] = lambda: Identity(user_id=USER)
    app.dependency_overrides[get_membership_repository] = TestRepository
    response = client.get("/api/v1/session")
    assert response.status_code == 200
    assert response.json()["organization_id"] == str(ORG)
    assert response.json()["role"] == "employee"


@pytest.mark.parametrize("role", ["employee", "supervisor", "security_auditor", "system_owner"])
def test_non_hr_roles_do_not_inherit_hr_authority(role):
    membership = Membership(user_id=USER, organization_id=ORG, role=role)
    with pytest.raises(DomainError) as error:
        require_role(membership, {"hr"})
    assert error.value.status_code == 403


def test_cross_organization_scope_is_denied():
    membership = Membership(user_id=USER, organization_id=ORG, role="hr")
    require_organization(membership, ORG)
    with pytest.raises(DomainError):
        require_organization(membership, UUID("00000000-0000-4000-8000-000000000099"))
    for private_role in ["system_owner", "security_auditor"]:
        with pytest.raises(DomainError):
            require_role(membership, {private_role})


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
    response = client.get("/test-error", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 500
    assert "secret-database-password" not in response.text
    assert response.json()["error"]["code"] == "internal_error"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"cors_origins": ["*"]},
        {"app_env": "production", "cors_origins": ["http://example.org"]},
        {"allowed_hosts": ["*"]},
        {"supabase_jwt_issuer": ISSUER},
        {"supabase_jwt_issuer": ISSUER, "supabase_jwks_url": "http://example.org/keys"},
    ],
)
def test_insecure_settings_are_rejected(kwargs):
    with pytest.raises(ValidationError):
        Settings(**kwargs)


def test_production_disables_api_documentation():
    with TestClient(
        create_app(Settings(app_env="production", cors_origins=["https://example.org"]))
    ) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404


@pytest.fixture
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.mark.parametrize(
    "case, expected",
    [
        ("valid", 503),
        ("expired", 401),
        ("wrong-audience", 401),
        ("wrong-issuer", 401),
        ("wrong-key", 401),
    ],
)
def test_signed_jwts_are_verified_before_membership(monkeypatch, signing_key, case, expected):
    now = datetime.now(UTC)
    claims = {
        "sub": str(USER),
        "iss": ISSUER,
        "aud": "authenticated",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    if case == "expired":
        claims["exp"] = now - timedelta(minutes=1)
    if case == "wrong-audience":
        claims["aud"] = "another-app"
    if case == "wrong-issuer":
        claims["iss"] = "https://untrusted.example.org"
    actual_key = (
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        if case == "wrong-key"
        else signing_key
    )
    token = jwt.encode(claims, actual_key, algorithm="RS256", headers={"kid": "test-key"})
    monkeypatch.setattr(
        "app.core.security.jwks_client",
        lambda _url: SimpleNamespace(
            get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=signing_key.public_key())
        ),
    )
    application = create_app(
        Settings(app_env="test", supabase_jwt_issuer=ISSUER, supabase_jwks_url=JWKS)
    )
    with TestClient(application) as client:
        response = client.get("/api/v1/session", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == expected
    assert response.json()["error"]["code"] == (
        "authorization_unavailable" if case == "valid" else "invalid_token"
    )
