from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import require_csrf_origin
from app.schemas.auth import LoginRequest, SessionResult
from app.services.auth import AuthService, IssuedSession

router = APIRouter(prefix="/auth", tags=["auth"])


def set_session_cookies(response: Response, issued: IssuedSession, settings: Settings) -> None:
    common = {
        "httponly": True,
        "secure": settings.session_cookie_secure,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(
        settings.access_cookie_name,
        issued.access_token,
        max_age=settings.access_session_minutes * 60,
        **common,
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        issued.refresh_token,
        max_age=settings.refresh_session_days * 86400,
        **common,
    )


def clear_session_cookies(response: Response, settings: Settings) -> None:
    for name in (settings.access_cookie_name, settings.refresh_cookie_name):
        response.delete_cookie(name, path="/", secure=settings.session_cookie_secure)
        response.delete_cookie(name, path="/api/v1", secure=settings.session_cookie_secure)


@router.post("/login", response_model=SessionResult)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionResult:
    require_csrf_origin(request, settings)
    client = request.client.host if request.client else "unknown"
    throttle_key = f"{client}:{payload.email.strip().lower()}"
    issued = AuthService(db, settings).login(payload.email, payload.password, throttle_key)
    set_session_cookies(response, issued, settings)
    return SessionResult(status="authenticated")


@router.post("/refresh", response_model=SessionResult)
def refresh(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionResult:
    require_csrf_origin(request, settings)
    issued = AuthService(db, settings).refresh(request.cookies.get(settings.refresh_cookie_name))
    set_session_cookies(response, issued, settings)
    return SessionResult(status="refreshed")


@router.post("/logout", response_model=SessionResult)
def logout(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionResult:
    require_csrf_origin(request, settings)
    AuthService(db, settings).logout(
        request.cookies.get(settings.access_cookie_name),
        request.cookies.get(settings.refresh_cookie_name),
    )
    clear_session_cookies(response, settings)
    return SessionResult(status="logged_out")
