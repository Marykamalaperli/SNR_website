from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.core.errors import DomainError
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
    StoreAdminCreate,
    StoreAdminListOut,
    StoreAdminOut,
    StoreCreate,
    StoreListOut,
    StoreOut,
    StoreUpdate,
)
from app.services.workforce import (
    AssignmentService,
    EmployeeService,
    ShiftService,
    StoreService,
)

router = APIRouter(tags=["workforce"])

STORE_WRITERS = {"system_admin"}
STORE_READERS = {"system_admin", "hr_payroll", "store_admin", "auditor"}
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
    organization_id: UUID | None = Query(None),
) -> EmployeeOut:
    user = require_role(current, EMPLOYEE_WRITERS)
    target_org_id = organization_id
    if target_org_id is None:
        store = db.get(Store, payload.home_store_id)
        if store:
            target_org_id = store.organization_id
    if target_org_id is None:
        for s in user.scopes:
            if s.organization_id is not None:
                target_org_id = s.organization_id
                break
    if target_org_id is None:
        from app.models.identity import Organization
        first_org = db.scalar(select(Organization.id).limit(1))
        if not first_org:
            raise DomainError("missing_organization", "An organization must exist.", 400)
        target_org_id = first_org

    scope = require_scope(user, target_org_id, permitted=EMPLOYEE_WRITERS)
    employee = EmployeeService(db).create_employee(payload, target_org_id, scope)
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
    organization_id: UUID | None = Query(None),
) -> ShiftOut:
    user = require_role(current, SHIFT_WRITERS)
    target_org_id = organization_id
    if target_org_id is None:
        store = db.get(Store, payload.store_id)
        if store:
            target_org_id = store.organization_id
    if target_org_id is None:
        for s in user.scopes:
            if s.organization_id is not None:
                target_org_id = s.organization_id
                break
    if target_org_id is None:
        from app.models.identity import Organization
        first_org = db.scalar(select(Organization.id).limit(1))
        if not first_org:
            raise DomainError("missing_organization", "An organization must exist.", 400)
        target_org_id = first_org

    scope = require_scope(user, target_org_id, permitted=SHIFT_WRITERS)
    shift = ShiftService(db).create_shift(payload, target_org_id, scope)
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
    organization_id: UUID | None = Query(None),
) -> AssignmentOut:
    user = require_role(current, ASSIGNMENT_WRITERS)
    target_org_id = organization_id
    if target_org_id is None:
        from app.models.identity import Shift
        shift = db.get(Shift, payload.shift_id)
        if shift:
            target_org_id = shift.organization_id
    if target_org_id is None:
        for s in user.scopes:
            if s.organization_id is not None:
                target_org_id = s.organization_id
                break
    if target_org_id is None:
        from app.models.identity import Organization
        first_org = db.scalar(select(Organization.id).limit(1))
        if not first_org:
            raise DomainError("missing_organization", "An organization must exist.", 400)
        target_org_id = first_org

    scope = require_scope(user, target_org_id, permitted=ASSIGNMENT_WRITERS)
    assignment = AssignmentService(db).create_assignment(
        payload, target_org_id, scope, created_by=user.user_id
    )
    return AssignmentOut.model_validate(assignment)


# --- Store endpoints ---


@router.get("/stores", response_model=StoreListOut)
def list_stores(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    organization_id: UUID | None = None,
    active_only: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> StoreListOut:
    user = require_role(current, STORE_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in STORE_READERS:
            scope = s
            break
    items, total = StoreService(db).list_stores(
        scope, organization_id=organization_id, active_only=active_only, offset=offset, limit=limit
    )
    return StoreListOut(items=[StoreOut.model_validate(s) for s in items], total=total)


@router.get("/stores/{store_id}", response_model=StoreOut)
def get_store(
    store_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> StoreOut:
    user = require_role(current, STORE_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in STORE_READERS:
            scope = s
            break
    store = StoreService(db).get_store(store_id, scope)
    return StoreOut.model_validate(store)


@router.post("/stores", response_model=StoreOut, status_code=201)
def create_store(
    payload: StoreCreate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    organization_id: UUID | None = Query(None),
) -> StoreOut:
    user = require_role(current, STORE_WRITERS)
    target_org_id = organization_id
    if target_org_id is None:
        for s in user.scopes:
            if s.organization_id is not None:
                target_org_id = s.organization_id
                break
    if target_org_id is None:
        from app.models.identity import Organization

        first_org = db.scalar(select(Organization.id).limit(1))
        if not first_org:
            raise DomainError(
                "missing_organization", "An organization must exist before creating a store.", 400
            )
        target_org_id = first_org

    scope = user.scopes[0]
    store = StoreService(db).create_store(payload, target_org_id, scope)
    return StoreOut.model_validate(store)


@router.patch("/stores/{store_id}", response_model=StoreOut)
def update_store(
    store_id: UUID,
    payload: StoreUpdate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> StoreOut:
    user = require_role(current, STORE_WRITERS)
    scope = user.scopes[0]
    store = StoreService(db).update_store(store_id, payload, scope)
    return StoreOut.model_validate(store)


@router.post("/stores/{store_id}/admins", response_model=StoreAdminOut, status_code=201)
def create_store_admin(
    store_id: UUID,
    payload: StoreAdminCreate,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> StoreAdminOut:
    user = require_role(current, STORE_WRITERS)
    scope = user.scopes[0]
    payload.store_id = store_id
    admin_dict = StoreService(db).create_store_admin(payload, scope)
    return StoreAdminOut.model_validate(admin_dict)


@router.get("/stores/{store_id}/admins", response_model=StoreAdminListOut)
def list_store_admins(
    store_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> StoreAdminListOut:
    user = require_role(current, STORE_READERS)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in STORE_READERS:
            scope = s
            break
    items, total = StoreService(db).list_store_admins(store_id, scope)
    return StoreAdminListOut(items=[StoreAdminOut.model_validate(a) for a in items], total=total)


@router.get("/store-admins", response_model=StoreAdminListOut)
def list_all_store_admins(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    store_id: UUID | None = None,
) -> StoreAdminListOut:
    user = require_role(current, {"system_admin"})
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role == "system_admin":
            scope = s
            break
    items, total = StoreService(db).list_all_store_admins(store_id, scope)
    return StoreAdminListOut(items=[StoreAdminOut.model_validate(a) for a in items], total=total)


