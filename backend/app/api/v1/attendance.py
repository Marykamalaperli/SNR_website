from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.errors import DomainError
from app.core.security import require_current_user, require_role
from app.schemas.attendance import (
    AttendanceEventListOut,
    AttendanceEventOut,
    AttendanceEventRequest,
    PhotoUploadIntentOut,
    PhotoUploadIntentRequest,
    StoreQRChallengeOut,
)
from app.schemas.auth import CurrentUser
from app.services.attendance import AttendanceService

router = APIRouter(prefix="/attendance", tags=["attendance"])

QR_ISSUERS = {"store_admin", "system_admin"}
ATTENDANCE_READERS = {"employee", "store_admin", "hr_payroll", "system_admin", "auditor"}


@router.post("/challenges/issue", response_model=StoreQRChallengeOut)
def issue_challenge(
    store_id: UUID = Query(...),
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> StoreQRChallengeOut:
    user = require_role(current, QR_ISSUERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in QR_ISSUERS:
            scope = s
            break
    return AttendanceService(db, settings).issue_qr_challenge(store_id, user, scope)


@router.post("/upload-intent", response_model=PhotoUploadIntentOut)
def create_upload_intent(
    payload: PhotoUploadIntentRequest,
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> PhotoUploadIntentOut:
    require_role(current, {"employee", "store_admin", "system_admin"})
    scope = current.scopes[0]
    return AttendanceService(db, settings).create_photo_upload_intent(
        payload.store_id, current, scope
    )


@router.put("/evidence/{photo_key:path}", status_code=200)
async def upload_evidence(
    photo_key: str,
    request: Request,
    current: CurrentUser = Depends(require_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    require_role(current, {"employee", "store_admin", "system_admin"})
    content = await request.body()
    if len(content) > 5242880:
        raise DomainError("file_too_large", "Evidence upload exceeds 5 MB limit.", 413)
    if len(content) == 0:
        raise DomainError("empty_file", "Uploaded evidence file is empty.", 400)
    return {"status": "uploaded", "photo_key": photo_key}


@router.post("/events", response_model=AttendanceEventOut, status_code=201)
def record_event(
    payload: AttendanceEventRequest,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AttendanceEventOut:
    require_role(current, {"employee", "store_admin", "system_admin"})
    if not idempotency_key or len(idempotency_key.strip()) < 8:
        raise DomainError(
            "missing_idempotency_key",
            "A valid Idempotency-Key header is required for attendance punch actions.",
            400,
        )

    scope = current.scopes[0]
    event = AttendanceService(db, settings).record_event(
        payload, idempotency_key.strip(), current, scope
    )
    return AttendanceEventOut.model_validate(event)


@router.get("/events", response_model=AttendanceEventListOut)
def list_events(
    employee_id: UUID | None = None,
    store_id: UUID | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AttendanceEventListOut:
    user = require_role(current, ATTENDANCE_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in ATTENDANCE_READERS:
            scope = s
            break

    # If employee role, can only list own events
    if scope.role == "employee":
        from sqlalchemy import select

        from app.models.identity import Employee

        emp = db.scalar(select(Employee).where(Employee.user_id == current.user_id))
        if not emp:
            return AttendanceEventListOut(items=[], total=0)
        employee_id = emp.id

    items, total = AttendanceService(db, settings).list_events(
        scope,
        employee_id=employee_id,
        store_id=store_id,
        start_date=start_date,
        end_date=end_date,
        offset=offset,
        limit=limit,
    )
    return AttendanceEventListOut(
        items=[AttendanceEventOut.model_validate(e) for e in items], total=total
    )
