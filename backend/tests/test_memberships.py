import base64
import json
from uuid import UUID

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import DomainError
from app.schemas.session import Identity
from app.services.memberships import SupabaseMembershipRepository

USER = UUID("00000000-0000-4000-8000-000000000001")
ORG = UUID("00000000-0000-4000-8000-000000000010")


def settings(**kwargs):
    return Settings(
        supabase_url="https://project.example.org",
        supabase_publishable_key="sb_publishable_unit_test",
        **kwargs,
    )


def membership(**kwargs):
    return {
        "user_id": str(USER),
        "organization_id": str(ORG),
        "organization_name": "Authorized organization",
        "role": "employee",
        **kwargs,
    }


def test_rpc_uses_public_key_user_jwt_and_no_client_supplied_roles():
    def respond(request):
        assert str(request.url) == "https://project.example.org/rest/v1/rpc/current_workspace"
        assert request.headers["apikey"] == "sb_publishable_unit_test"
        assert request.headers["authorization"] == "Bearer verified-user-token"
        assert json.loads(request.content) == {}
        return httpx.Response(200, json=membership())

    repository = SupabaseMembershipRepository(
        settings(), "verified-user-token", httpx.MockTransport(respond)
    )
    result = repository.resolve(Identity(user_id=USER))
    assert result.organization_id == ORG
    assert result.role == "employee"
    assert result.organization_name == "Authorized organization"


@pytest.mark.parametrize(
    "remote, status", [(401, 401), (403, 403), (409, 409), (404, 503), (500, 503)]
)
def test_rpc_failures_are_closed_and_do_not_reflect_database_details(remote, status):
    repository = SupabaseMembershipRepository(
        settings(),
        "token",
        httpx.MockTransport(
            lambda _request: httpx.Response(remote, json={"message": "private database details"})
        ),
    )
    with pytest.raises(DomainError) as error:
        repository.resolve(Identity(user_id=USER))
    assert error.value.status_code == status
    assert "private database details" not in error.value.message


@pytest.mark.parametrize("payload", [None, [], {"role": "hr"}, membership(role="owner")])
def test_malformed_rpc_responses_never_produce_a_membership(payload):
    repository = SupabaseMembershipRepository(
        settings(), "token", httpx.MockTransport(lambda _request: httpx.Response(200, json=payload))
    )
    with pytest.raises(DomainError) as error:
        repository.resolve(Identity(user_id=USER))
    assert error.value.status_code == 503


def test_rpc_cannot_change_the_verified_user_identity():
    repository = SupabaseMembershipRepository(
        settings(),
        "token",
        httpx.MockTransport(
            lambda _request: httpx.Response(
                200, json=membership(user_id="00000000-0000-4000-8000-000000000099")
            )
        ),
    )
    with pytest.raises(DomainError) as error:
        repository.resolve(Identity(user_id=USER))
    assert error.value.status_code == 403


def test_network_failure_never_returns_an_authorized_fallback():
    def fail(request):
        raise httpx.ConnectError("unavailable", request=request)

    repository = SupabaseMembershipRepository(settings(), "token", httpx.MockTransport(fail))
    with pytest.raises(DomainError) as error:
        repository.resolve(Identity(user_id=USER))
    assert error.value.status_code == 503


def test_project_issuer_and_jwks_are_derived_from_the_public_origin():
    config = settings()
    assert config.supabase_jwt_issuer == "https://project.example.org/auth/v1"
    assert config.supabase_jwks_url == "https://project.example.org/auth/v1/.well-known/jwks.json"


@pytest.mark.parametrize(
    "key",
    [
        "sb_secret_private_sentinel",
        "not-a-public-key",
        "e30."
        + base64.urlsafe_b64encode(json.dumps({"role": "service_role"}).encode()).decode()
        + ".fake",
    ],
)
def test_service_role_keys_are_rejected_and_redacted(key):
    with pytest.raises(ValidationError) as error:
        Settings(supabase_url="https://project.example.org", supabase_publishable_key=key)
    assert key not in str(error.value)
