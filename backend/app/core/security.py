from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, PyJWKClientConnectionError

from app.core.config import Settings, get_settings
from app.core.errors import DomainError
from app.schemas.session import Identity, Membership

bearer = HTTPBearer(auto_error=False)


@lru_cache(maxsize=4)
def jwks_client(url: str) -> PyJWKClient:
    # PyJWKClient caches keys, requires TLS verification and has a bounded timeout.
    return PyJWKClient(url, cache_keys=True, lifespan=300, timeout=5)


def require_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> Identity:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise DomainError("unauthenticated", "Sign in to continue.", 401)
    if not settings.supabase_jwks_url or not settings.supabase_jwt_issuer:
        raise DomainError("auth_unavailable", "Sign-in is not available yet.", 503)
    try:
        key = jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(
            credentials.credentials
        )
        claims = jwt.decode(
            credentials.credentials,
            key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_jwt_issuer,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            leeway=10,
        )
        return Identity(user_id=UUID(claims["sub"]))
    except PyJWKClientConnectionError as exc:
        raise DomainError(
            "auth_unavailable", "Identity verification is temporarily unavailable.", 503
        ) from exc
    except (jwt.PyJWTError, ValueError, TypeError, KeyError) as exc:
        raise DomainError(
            "invalid_token", "Your session could not be verified. Sign in again.", 401
        ) from exc


def require_role(membership: Membership, permitted: set[str]) -> Membership:
    """Exact permissions only: HR, auditor and owner do not inherit each other."""
    if membership.role not in permitted:
        raise DomainError("forbidden", "This action is not available to your role.", 403)
    return membership


def require_organization(membership: Membership, organization_id: UUID) -> None:
    if membership.organization_id != organization_id:
        raise DomainError("forbidden", "This record is outside your organization.", 403)
