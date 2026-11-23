from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.errors import DomainError
from app.core.security import require_current_user, require_role
from app.models.identity import Employee
from app.schemas.attendance import (
    AttendanceAdjustmentCreate,
    AttendanceAdjustmentOut,
    AttendanceAdjustmentReview,
    AttendanceDayListOut,
    AttendanceDayOut,
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
ADJUSTMENT_REQUESTERS = {"store_admin", "hr_payroll", "system_admin"}
ADJUSTMENT_REVIEWERS = {"hr_payroll", "system_admin"}


@router.post("/challenges/issue", response_model=StoreQRChallengeOut)
def issue_challenge(
    store_id: UUID = Query(...),
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> StoreQRChallengeOut:
    allowed_issuers = (
        {"store_admin", "system_admin", "employee"}
        if settings.app_env != "production"
        else {"store_admin", "system_admin"}
    )
    user = require_role(current, allowed_issuers)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in allowed_issuers:
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

    if scope.role == "employee":
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


@router.get("/days", response_model=AttendanceDayListOut)
def list_days(
    store_id: UUID | None = None,
    employee_id: UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    status: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AttendanceDayListOut:
    user = require_role(current, {"store_admin", "hr_payroll", "system_admin", "auditor"})
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in {"store_admin", "hr_payroll", "system_admin", "auditor"}:
            scope = s
            break

    items, total = AttendanceService(db, settings).list_days(
        scope,
        store_id=store_id,
        employee_id=employee_id,
        from_date=from_date,
        to_date=to_date,
        status=status,
        offset=offset,
        limit=limit,
    )
    return AttendanceDayListOut(items=items, total=total)


@router.get("/me/days", response_model=AttendanceDayListOut)
def list_my_days(
    from_date: date | None = None,
    to_date: date | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AttendanceDayListOut:
    require_role(current, {"employee", "store_admin", "hr_payroll", "system_admin", "auditor"})
    emp = db.scalar(select(Employee).where(Employee.user_id == current.user_id))
    if not emp:
        return AttendanceDayListOut(items=[], total=0)

    scope = current.scopes[0]
    items, total = AttendanceService(db, settings).list_days(
        scope,
        employee_id=emp.id,
        from_date=from_date,
        to_date=to_date,
        offset=offset,
        limit=limit,
    )
    return AttendanceDayListOut(items=items, total=total)


@router.get("/days/{day_id}", response_model=AttendanceDayOut)
def get_day(
    day_id: UUID,
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AttendanceDayOut:
    require_role(current, ATTENDANCE_READERS)
    scope = current.scopes[0]
    return AttendanceService(db, settings).get_day(day_id, scope)


@router.post("/days/{day_id}/adjustments", response_model=AttendanceAdjustmentOut, status_code=201)
def request_adjustment(
    day_id: UUID,
    payload: AttendanceAdjustmentCreate,
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AttendanceAdjustmentOut:
    user = require_role(current, ADJUSTMENT_REQUESTERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in ADJUSTMENT_REQUESTERS:
            scope = s
            break

    return AttendanceService(db, settings).request_adjustment(day_id, payload, user, scope)


@router.post("/adjustments/{adjustment_id}/review", response_model=AttendanceAdjustmentOut)
def review_adjustment(
    adjustment_id: UUID,
    payload: AttendanceAdjustmentReview,
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AttendanceAdjustmentOut:
    user = require_role(current, ADJUSTMENT_REVIEWERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in ADJUSTMENT_REVIEWERS:
            scope = s
            break

    return AttendanceService(db, settings).review_adjustment(adjustment_id, payload, user, scope)


@router.get("/adjustments", response_model=list[AttendanceAdjustmentOut])
def list_adjustments(
    attendance_day_id: UUID | None = None,
    status: str | None = None,
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> list[AttendanceAdjustmentOut]:
    user = require_role(current, {"store_admin", "hr_payroll", "system_admin", "auditor"})
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in {"store_admin", "hr_payroll", "system_admin", "auditor"}:
            scope = s
            break

    return AttendanceService(db, settings).list_adjustments(
        scope, attendance_day_id=attendance_day_id, status=status
    )
