from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.core.security import require_current_user, require_role, require_scope
from app.schemas.auth import CurrentUser
from app.schemas.workforce import (
    AssignmentCreate,
    AssignmentListOut,
    AssignmentOut,
    EmployeeCreate,
    EmployeeListOut,
    EmployeeOut,
    EmployeeUpdate,
    ShiftCreate,
    ShiftListOut,
    ShiftOut,
    ShiftUpdate,
)
from app.services.workforce import AssignmentService, EmployeeService, ShiftService

router = APIRouter(tags=["workforce"])

EMPLOYEE_WRITERS = {"store_admin", "hr_payroll", "system_admin"}
EMPLOYEE_READERS = {"store_admin", "hr_payroll", "system_admin", "auditor"}
SHIFT_WRITERS = {"store_admin", "system_admin"}
SHIFT_READERS = {"store_admin", "hr_payroll", "system_admin", "auditor"}
ASSIGNMENT_WRITERS = {"store_admin", "system_admin"}


# --- Employee endpoints ---


@router.get("/employees", response_model=EmployeeListOut)
def list_employees(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    store_id: UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> EmployeeListOut:
    user = require_role(current, EMPLOYEE_READERS)
    # Use first suitable scope
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in EMPLOYEE_READERS:
            scope = s
            break
    items, total = EmployeeService(db).list_employees(
        scope, store_id=store_id, status=status, search=search, offset=offset, limit=limit
    )
    return EmployeeListOut(items=[EmployeeOut.model_validate(e) for e in items], total=total)


@router.get("/employees/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> EmployeeOut:
    user = require_role(current, EMPLOYEE_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in EMPLOYEE_READERS:
            scope = s
            break
    employee = EmployeeService(db).get_employee(employee_id, scope)
    return EmployeeOut.model_validate(employee)


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    organization_id: UUID = Query(...),
) -> EmployeeOut:
    user = require_role(current, EMPLOYEE_WRITERS)
    scope = require_scope(user, organization_id, permitted=EMPLOYEE_WRITERS)
    employee = EmployeeService(db).create_employee(payload, organization_id, scope)
    return EmployeeOut.model_validate(employee)


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: UUID,
    payload: EmployeeUpdate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> EmployeeOut:
    user = require_role(current, EMPLOYEE_WRITERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in EMPLOYEE_WRITERS:
            scope = s
            break
    employee = EmployeeService(db).update_employee(employee_id, payload, scope)
    return EmployeeOut.model_validate(employee)


@router.post("/employees/{employee_id}/deactivate", response_model=EmployeeOut)
def deactivate_employee(
    employee_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> EmployeeOut:
    require_role(current, {"hr_payroll", "system_admin"})
    scope = current.scopes[0]
    for s in current.scopes:
        if s.role in {"hr_payroll", "system_admin"}:
            scope = s
            break
    employee = EmployeeService(db).deactivate_employee(employee_id, scope)
    return EmployeeOut.model_validate(employee)


# --- Shift endpoints ---


@router.get("/shifts", response_model=ShiftListOut)
def list_shifts(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    store_id: UUID | None = None,
    active_only: bool = True,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> ShiftListOut:
    user = require_role(current, SHIFT_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in SHIFT_READERS:
            scope = s
            break
    items, total = ShiftService(db).list_shifts(
        scope, store_id=store_id, active_only=active_only, offset=offset, limit=limit
    )
    return ShiftListOut(items=[ShiftOut.model_validate(s) for s in items], total=total)


@router.get("/shifts/{shift_id}", response_model=ShiftOut)
def get_shift(
    shift_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> ShiftOut:
    user = require_role(current, SHIFT_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in SHIFT_READERS:
            scope = s
            break
    shift = ShiftService(db).get_shift(shift_id, scope)
    return ShiftOut.model_validate(shift)


@router.post("/shifts", response_model=ShiftOut, status_code=201)
def create_shift(
    payload: ShiftCreate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    organization_id: UUID = Query(...),
) -> ShiftOut:
    user = require_role(current, SHIFT_WRITERS)
    scope = require_scope(user, organization_id, permitted=SHIFT_WRITERS)
    shift = ShiftService(db).create_shift(payload, organization_id, scope)
    return ShiftOut.model_validate(shift)


@router.patch("/shifts/{shift_id}", response_model=ShiftOut)
def update_shift(
    shift_id: UUID,
    payload: ShiftUpdate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> ShiftOut:
    user = require_role(current, SHIFT_WRITERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in SHIFT_WRITERS:
            scope = s
            break
    shift = ShiftService(db).update_shift(shift_id, payload, scope)
    return ShiftOut.model_validate(shift)


# --- Assignment endpoints ---


@router.get("/assignments", response_model=AssignmentListOut)
def list_assignments(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    employee_id: UUID | None = None,
    store_id: UUID | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> AssignmentListOut:
    user = require_role(current, SHIFT_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in SHIFT_READERS:
            scope = s
            break
    items, total = AssignmentService(db).list_assignments(
        scope, employee_id=employee_id, store_id=store_id, offset=offset, limit=limit
    )
    return AssignmentListOut(items=[AssignmentOut.model_validate(a) for a in items], total=total)


@router.post("/assignments", response_model=AssignmentOut, status_code=201)
def create_assignment(
    payload: AssignmentCreate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    organization_id: UUID = Query(...),
) -> AssignmentOut:
    user = require_role(current, ASSIGNMENT_WRITERS)
    scope = require_scope(user, organization_id, permitted=ASSIGNMENT_WRITERS)
    assignment = AssignmentService(db).create_assignment(
        payload, organization_id, scope, created_by=user.user_id
    )
    return AssignmentOut.model_validate(assignment)
