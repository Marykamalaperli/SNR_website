from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.errors import DomainError
from app.models.identity import User
from app.schemas.auth import CurrentUser, RoleName, Scope
from app.services.auth import AuthService


def require_user(
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    return AuthService(db, settings).authenticate(request.cookies.get(settings.access_cookie_name))


def require_current_user(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    return AuthService(db, settings).current_user(user)


def require_role(current: CurrentUser, permitted: set[RoleName]) -> CurrentUser:
    if not any(scope.role in permitted for scope in current.scopes):
        raise DomainError("forbidden", "This action is not available to your role.", 403)
    return current


def require_scope(
    current: CurrentUser,
    organization_id: UUID,
    store_id: UUID | None = None,
    permitted: set[RoleName] | None = None,
) -> Scope:
    for scope in current.scopes:
        if permitted and scope.role not in permitted:
            continue
        if scope.role == "system_admin":
            return scope
        if scope.organization_id != organization_id:
            continue
        if store_id is not None and scope.store_id not in {None, store_id}:
            continue
        return scope
    raise DomainError("forbidden", "This record is outside your authorized scope.", 403)


def require_csrf_origin(request: Request, settings: Settings) -> None:
    if request.headers.get("origin") not in settings.cors_origins:
        raise DomainError("csrf_rejected", "The request origin is not allowed.", 403)
