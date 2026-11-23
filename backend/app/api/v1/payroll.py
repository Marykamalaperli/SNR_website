from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import require_current_user, require_role
from app.models.payroll import PayrollAuditLog
from app.schemas.auth import CurrentUser, Scope
from app.schemas.payroll import (
    CalculateDraftRunRequest,
    PayPeriodCreate,
    PayPeriodOut,
    PayrollAuditLogOut,
    PayrollConfigCreate,
    PayrollConfigOut,
    PayrollRunApproveRequest,
    PayrollRunOut,
    PayrollRunPreviewOut,
    PayrollRunReverseRequest,
    PayslipOut,
)
from app.services.payroll import PayrollService

router = APIRouter(prefix="/payroll", tags=["payroll"])

PAYROLL_MANAGERS = {"hr_payroll", "system_admin"}
PAYROLL_READERS = {"hr_payroll", "system_admin", "auditor"}


def _get_active_scope(current: CurrentUser, allowed_roles: set[str]) -> Scope:
    require_role(current, allowed_roles)
    for s in current.scopes:
        if s.role in allowed_roles:
            return s
    return current.scopes[0]


# 1. Pay Periods
@router.post("/pay-periods", response_model=PayPeriodOut, status_code=status.HTTP_201_CREATED)
def create_pay_period(
    payload: PayPeriodCreate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayPeriodOut:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.create_pay_period(scope, payload)


@router.get("/pay-periods", response_model=list[PayPeriodOut])
def list_pay_periods(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    status: str | None = Query(None),
) -> list[PayPeriodOut]:
    scope = _get_active_scope(current, PAYROLL_READERS)
    service = PayrollService(db, settings)
    return service.list_pay_periods(scope, status=status)


# 2. Configurations (Rates)
@router.post(
    "/configurations", response_model=PayrollConfigOut, status_code=status.HTTP_201_CREATED
)
def create_payroll_configuration(
    payload: PayrollConfigCreate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayrollConfigOut:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.create_payroll_configuration(scope, current.user_id, payload)


@router.get("/configurations", response_model=list[PayrollConfigOut])
def list_payroll_configurations(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    employee_id: UUID | None = Query(None),
) -> list[PayrollConfigOut]:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.list_payroll_configurations(scope, employee_id=employee_id)


# 3. Runs (Deterministic Draft)
@router.post(
    "/runs/calculate-draft", response_model=PayrollRunOut, status_code=status.HTTP_201_CREATED
)
def calculate_draft_run(
    payload: CalculateDraftRunRequest,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayrollRunOut:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.calculate_draft_run(scope, current.user_id, payload)


@router.get("/runs", response_model=list[PayrollRunOut])
def list_payroll_runs(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    pay_period_id: UUID | None = Query(None),
) -> list[PayrollRunOut]:
    scope = _get_active_scope(current, PAYROLL_READERS)
    service = PayrollService(db, settings)
    return service.list_payroll_runs(scope, pay_period_id=pay_period_id)


@router.get("/runs/{run_id}", response_model=PayrollRunOut)
def get_payroll_run(
    run_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayrollRunOut:
    scope = _get_active_scope(current, PAYROLL_READERS)
    service = PayrollService(db, settings)
    return service.get_payroll_run(scope, run_id)


@router.get("/runs/{run_id}/preview", response_model=PayrollRunPreviewOut)
def preview_payroll_run(
    run_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayrollRunPreviewOut:
    scope = _get_active_scope(current, PAYROLL_READERS)
    service = PayrollService(db, settings)
    return service.preview_run(scope, run_id)


# 4. Day 7 - Validation, Approval, Release & Reversal
@router.post("/runs/{run_id}/validate", response_model=PayrollRunPreviewOut)
def validate_payroll_run(
    run_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayrollRunPreviewOut:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.preview_run(scope, run_id)


@router.post("/runs/{run_id}/approve", response_model=PayrollRunOut)
def approve_payroll_run(
    run_id: UUID,
    payload: PayrollRunApproveRequest,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayrollRunOut:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.approve_run(scope, current.user_id, run_id, notes=payload.notes)


@router.post("/runs/{run_id}/release", response_model=list[PayslipOut])
def release_payroll_run(
    run_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[PayslipOut]:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.release_run_payslips(scope, current.user_id, run_id)


@router.post("/runs/{run_id}/reverse", response_model=PayrollRunOut)
def reverse_payroll_run(
    run_id: UUID,
    payload: PayrollRunReverseRequest,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayrollRunOut:
    scope = _get_active_scope(current, PAYROLL_MANAGERS)
    service = PayrollService(db, settings)
    return service.reverse_run(scope, current.user_id, run_id, reason=payload.reason)


@router.get("/audit-logs", response_model=list[PayrollAuditLogOut])
def list_payroll_audit_logs(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    payroll_run_id: UUID | None = Query(None),
) -> list[PayrollAuditLogOut]:
    scope = _get_active_scope(current, PAYROLL_READERS)
    query = select(PayrollAuditLog)
    if scope.role != "system_admin":
        query = query.where(PayrollAuditLog.organization_id == scope.organization_id)
    if payroll_run_id:
        query = query.where(PayrollAuditLog.payroll_run_id == payroll_run_id)
    query = query.order_by(PayrollAuditLog.created_at.desc())
    return list(db.scalars(query).all())
