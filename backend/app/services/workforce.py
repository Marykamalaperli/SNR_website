import secrets
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models.identity import Employee, RoleAssignment, Store, User
from app.models.workforce import Shift, ShiftAssignment
from app.schemas.auth import Scope
from app.schemas.workforce import (
    AssignmentCreate,
    EmployeeCreate,
    EmployeeUpdate,
    ShiftCreate,
    ShiftUpdate,
    StoreAdminCreate,
    StoreCreate,
    StoreUpdate,
)


def _store_in_scope(db: Session, store_id: UUID, scope: Scope) -> Store:
    """Verify that the requested store is accessible within the given scope."""
    store = db.get(Store, store_id)
    if not store:
        raise DomainError("not_found", "Store not found.", 404)
    if scope.role != "system_admin":
        if store.organization_id != scope.organization_id:
            raise DomainError("forbidden", "This record is outside your authorized scope.", 403)
        if scope.store_id is not None and scope.store_id != store_id:
            raise DomainError("forbidden", "This record is outside your authorized scope.", 403)
    return store


class EmployeeService:
    def __init__(self, db: Session):
        self.db = db

    def list_employees(
        self,
        scope: Scope,
        store_id: UUID | None = None,
        status: str | None = None,
        search: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[Employee], int]:
        query = select(Employee)
        if scope.role == "system_admin":
            pass
        elif scope.store_id is not None:
            query = query.where(
                Employee.organization_id == scope.organization_id,
                Employee.home_store_id == scope.store_id,
            )
        else:
            query = query.where(Employee.organization_id == scope.organization_id)

        if store_id is not None:
            query = query.where(Employee.home_store_id == store_id)
        if status is not None:
            query = query.where(Employee.status == status)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                Employee.display_name.ilike(pattern) | Employee.employee_code.ilike(pattern)
            )

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        employees = list(
            self.db.scalars(query.order_by(Employee.display_name).offset(offset).limit(limit))
        )
        return employees, total or 0

    def get_employee(self, employee_id: UUID, scope: Scope) -> Employee:
        employee = self.db.get(Employee, employee_id)
        if not employee:
            raise DomainError("not_found", "Employee not found.", 404)
        self._check_scope(employee, scope)
        return employee

    def create_employee(
        self, payload: EmployeeCreate, organization_id: UUID, scope: Scope
    ) -> Employee:
        _store_in_scope(self.db, payload.home_store_id, scope)

        existing = self.db.scalar(
            select(Employee).where(
                Employee.organization_id == organization_id,
                Employee.employee_code == payload.employee_code,
            )
        )
        if existing:
            raise DomainError(
                "duplicate_employee_code",
                f"Employee code '{payload.employee_code}' is already in use.",
                409,
            )

        now = datetime.now(UTC)
        user_id = payload.user_id
        login_email: str | None = None
        temporary_password: str | None = None

        if payload.email:
            from app.services.auth import hash_password

            email_clean = str(payload.email).strip().lower()
            login_email = email_clean
            temporary_password = secrets.token_urlsafe(24)

            user = self.db.scalar(select(User).where(User.email == email_clean))
            assigned_role = (
                "store_admin"
                if payload.role in {"store_manager", "assistant_store_manager", "store_admin"}
                else "employee"
            )

            if user:
                user_id = user.id
                existing_ra = self.db.scalar(
                    select(RoleAssignment).where(
                        RoleAssignment.user_id == user.id,
                        RoleAssignment.role == assigned_role,
                        RoleAssignment.organization_id == organization_id,
                        RoleAssignment.store_id == payload.home_store_id,
                    )
                )
                if not existing_ra:
                    ra = RoleAssignment(
                        user_id=user.id,
                        role=assigned_role,
                        organization_id=organization_id,
                        store_id=payload.home_store_id,
                        active=True,
                        created_at=now,
                    )
                    self.db.add(ra)
            else:
                user = User(
                    email=email_clean,
                    display_name=payload.display_name.strip(),
                    password_hash=hash_password(temporary_password),
                    status="active",
                    token_version=1,
                    created_at=now,
                    updated_at=now,
                )
                self.db.add(user)
                self.db.flush()
                user_id = user.id

                ra = RoleAssignment(
                    user_id=user.id,
                    role=assigned_role,
                    organization_id=organization_id,
                    store_id=payload.home_store_id,
                    active=True,
                    created_at=now,
                )
                self.db.add(ra)

        employee = Employee(
            organization_id=organization_id,
            home_store_id=payload.home_store_id,
            user_id=user_id,
            employee_code=payload.employee_code,
            display_name=payload.display_name,
            status=payload.status,
            hire_date=payload.hire_date,
            created_at=now,
        )
        self.db.add(employee)
        self.db.commit()
        self.db.refresh(employee)

        employee.login_email = login_email
        employee.temporary_password = temporary_password
        return employee

    def update_employee(self, employee_id: UUID, payload: EmployeeUpdate, scope: Scope) -> Employee:
        employee = self.get_employee(employee_id, scope)
        if payload.display_name is not None:
            employee.display_name = payload.display_name
        if payload.home_store_id is not None:
            _store_in_scope(self.db, payload.home_store_id, scope)
            employee.home_store_id = payload.home_store_id
        if payload.status is not None:
            employee.status = payload.status
        if payload.exit_date is not None:
            employee.exit_date = payload.exit_date
        self.db.commit()
        self.db.refresh(employee)
        return employee

    def deactivate_employee(self, employee_id: UUID, scope: Scope) -> Employee:
        employee = self.get_employee(employee_id, scope)
        if employee.status == "deactivated":
            raise DomainError("already_deactivated", "Employee is already deactivated.", 409)
        employee.status = "deactivated"
        employee.exit_date = datetime.now(UTC).date()
        self.db.commit()
        self.db.refresh(employee)
        return employee

    def _check_scope(self, employee: Employee, scope: Scope) -> None:
        if scope.role == "system_admin":
            return
        if employee.organization_id != scope.organization_id:
            raise DomainError("forbidden", "This record is outside your authorized scope.", 403)
        if scope.store_id is not None and employee.home_store_id != scope.store_id:
            raise DomainError("forbidden", "This record is outside your authorized scope.", 403)


class ShiftService:
    def __init__(self, db: Session):
        self.db = db

    def list_shifts(
        self,
        scope: Scope,
        store_id: UUID | None = None,
        active_only: bool = True,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[Shift], int]:
        query = select(Shift)
        if scope.role == "system_admin":
            pass
        elif scope.store_id is not None:
            query = query.where(
                Shift.organization_id == scope.organization_id,
                Shift.store_id == scope.store_id,
            )
        else:
            query = query.where(Shift.organization_id == scope.organization_id)

        if store_id is not None:
            query = query.where(Shift.store_id == store_id)
        if active_only:
            query = query.where(Shift.active.is_(True))

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        shifts = list(self.db.scalars(query.order_by(Shift.name).offset(offset).limit(limit)))
        return shifts, total or 0

    def get_shift(self, shift_id: UUID, scope: Scope) -> Shift:
        shift = self.db.get(Shift, shift_id)
        if not shift:
            raise DomainError("not_found", "Shift not found.", 404)
        self._check_scope(shift, scope)
        return shift

    def create_shift(self, payload: ShiftCreate, organization_id: UUID, scope: Scope) -> Shift:
        _store_in_scope(self.db, payload.store_id, scope)

        existing = self.db.scalar(
            select(Shift).where(
                Shift.store_id == payload.store_id,
                Shift.code == payload.code,
            )
        )
        if existing:
            raise DomainError(
                "duplicate_shift_code",
                f"Shift code '{payload.code}' already exists in this store.",
                409,
            )

        now = datetime.now(UTC)
        shift = Shift(
            organization_id=organization_id,
            store_id=payload.store_id,
            code=payload.code,
            name=payload.name,
            start_time=payload.start_time,
            end_time=payload.end_time,
            break_minutes=payload.break_minutes,
            is_overnight=payload.is_overnight,
            active=True,
            created_at=now,
            updated_at=now,
        )
        self.db.add(shift)
        self.db.commit()
        self.db.refresh(shift)
        return shift

    def update_shift(self, shift_id: UUID, payload: ShiftUpdate, scope: Scope) -> Shift:
        shift = self.get_shift(shift_id, scope)
        if payload.name is not None:
            shift.name = payload.name
        if payload.start_time is not None:
            shift.start_time = payload.start_time
        if payload.end_time is not None:
            shift.end_time = payload.end_time
        if payload.break_minutes is not None:
            shift.break_minutes = payload.break_minutes
        if payload.is_overnight is not None:
            shift.is_overnight = payload.is_overnight
        if payload.active is not None:
            shift.active = payload.active
        shift.updated_at = datetime.now(UTC)
        self.db.commit()
        self.db.refresh(shift)
        return shift

    def _check_scope(self, shift: Shift, scope: Scope) -> None:
        if scope.role == "system_admin":
            return
        if shift.organization_id != scope.organization_id:
            raise DomainError("forbidden", "This record is outside your authorized scope.", 403)
        if scope.store_id is not None and shift.store_id != scope.store_id:
            raise DomainError("forbidden", "This record is outside your authorized scope.", 403)


class AssignmentService:
    def __init__(self, db: Session):
        self.db = db

    def list_assignments(
        self,
        scope: Scope,
        employee_id: UUID | None = None,
        store_id: UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[ShiftAssignment], int]:
        query = select(ShiftAssignment)
        if scope.role == "system_admin":
            pass
        else:
            query = query.where(ShiftAssignment.organization_id == scope.organization_id)

        if employee_id is not None:
            query = query.where(ShiftAssignment.employee_id == employee_id)

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        assignments = list(
            self.db.scalars(
                query.order_by(ShiftAssignment.effective_from.desc()).offset(offset).limit(limit)
            )
        )
        return assignments, total or 0

    def create_assignment(
        self,
        payload: AssignmentCreate,
        organization_id: UUID,
        scope: Scope,
        created_by: UUID,
    ) -> ShiftAssignment:
        if payload.effective_from > payload.effective_until:
            raise DomainError(
                "invalid_dates", "effective_from must be on or before effective_until.", 422
            )

        # Verify employee and shift exist and are in scope
        employee = self.db.get(Employee, payload.employee_id)
        if not employee or employee.organization_id != organization_id:
            raise DomainError("not_found", "Employee not found.", 404)

        shift = self.db.get(Shift, payload.shift_id)
        if not shift or shift.organization_id != organization_id:
            raise DomainError("not_found", "Shift not found.", 404)

        # Check for overlapping assignments for this employee
        overlap = self.db.scalar(
            select(ShiftAssignment).where(
                ShiftAssignment.employee_id == payload.employee_id,
                ShiftAssignment.effective_from <= payload.effective_until,
                ShiftAssignment.effective_until >= payload.effective_from,
            )
        )
        if overlap:
            raise DomainError(
                "overlapping_assignment",
                "This employee already has a shift assignment for the requested period.",
                409,
            )

        assignment = ShiftAssignment(
            organization_id=organization_id,
            employee_id=payload.employee_id,
            shift_id=payload.shift_id,
            effective_from=payload.effective_from,
            effective_until=payload.effective_until,
            created_at=datetime.now(UTC),
            created_by=created_by,
        )
        self.db.add(assignment)
        self.db.commit()
        self.db.refresh(assignment)
        return assignment


# --- Store Service ---


class StoreService:
    def __init__(self, db: Session):
        self.db = db

    def list_stores(
        self,
        scope: Scope,
        organization_id: UUID | None = None,
        active_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[Store], int]:
        query = select(Store)
        if scope.role == "system_admin":
            if organization_id is not None:
                query = query.where(Store.organization_id == organization_id)
        else:
            query = query.where(Store.organization_id == scope.organization_id)
            if scope.store_id is not None:
                query = query.where(Store.id == scope.store_id)

        if active_only:
            query = query.where(Store.active.is_(True))

        total = self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = list(
            self.db.scalars(query.order_by(Store.code.asc()).offset(offset).limit(limit)).all()
        )
        return items, total

    def get_store(self, store_id: UUID, scope: Scope) -> Store:
        return _store_in_scope(self.db, store_id, scope)

    def create_store(self, payload: StoreCreate, organization_id: UUID, scope: Scope) -> Store:
        if scope.role != "system_admin":
            raise DomainError("forbidden", "Only system administrators can create stores.", 403)

        existing = self.db.scalar(
            select(Store).where(
                Store.organization_id == organization_id,
                Store.code == payload.code.strip().upper(),
            )
        )
        if existing:
            raise DomainError(
                "duplicate_store_code",
                f"A store with code '{payload.code.strip().upper()}' already exists.",
                409,
            )

        now = datetime.now(UTC)
        store = Store(
            organization_id=organization_id,
            code=payload.code.strip().upper(),
            name=payload.name.strip(),
            timezone=payload.timezone.strip(),
            latitude=payload.latitude,
            longitude=payload.longitude,
            map_url=payload.map_url.strip() if payload.map_url else None,
            radius_meters=payload.radius_meters or 50,
            active=True,
            created_at=now,
        )
        self.db.add(store)
        self.db.commit()
        self.db.refresh(store)
        return store

    def create_store_admin(self, payload: StoreAdminCreate, scope: Scope) -> dict:
        if scope.role != "system_admin":
            raise DomainError(
                "forbidden", "Only system administrators can create store admin users.", 403
            )

        store = self.db.get(Store, payload.store_id)
        if not store:
            raise DomainError("not_found", "Store not found.", 404)

        email_clean = payload.email.strip().lower()
        now = datetime.now(UTC)

        user = self.db.scalar(select(User).where(User.email == email_clean))
        if user:
            existing_ra = self.db.scalar(
                select(RoleAssignment).where(
                    RoleAssignment.user_id == user.id,
                    RoleAssignment.role == "store_admin",
                    RoleAssignment.store_id == store.id,
                )
            )
            if existing_ra:
                raise DomainError(
                    "duplicate_assignment",
                    f"User {email_clean} is already a store admin for {store.name}.",
                    409,
                )
        else:
            from app.services.auth import hash_password

            user = User(
                email=email_clean,
                display_name=payload.display_name.strip(),
                password_hash=hash_password(payload.password),
                status="active",
                token_version=1,
                created_at=now,
                updated_at=now,
            )
            self.db.add(user)
            self.db.flush()

        role_assignment = RoleAssignment(
            user_id=user.id,
            role="store_admin",
            organization_id=store.organization_id,
            store_id=store.id,
            active=True,
            created_at=now,
        )
        self.db.add(role_assignment)
        self.db.commit()
        self.db.refresh(role_assignment)

        return {
            "id": role_assignment.id,
            "user_id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "store_id": store.id,
            "store_name": store.name,
            "role": "store_admin",
            "active": role_assignment.active,
            "created_at": role_assignment.created_at,
        }

    def list_store_admins(self, store_id: UUID, scope: Scope) -> tuple[list[dict], int]:
        store = _store_in_scope(self.db, store_id, scope)
        query = (
            select(RoleAssignment, User)
            .join(User, RoleAssignment.user_id == User.id)
            .where(
                RoleAssignment.store_id == store_id,
                RoleAssignment.role == "store_admin",
            )
        )
        results = self.db.execute(query).all()
        items = [
            {
                "id": ra.id,
                "user_id": u.id,
                "email": u.email,
                "display_name": u.display_name,
                "store_id": store.id,
                "store_name": store.name,
                "role": ra.role,
                "active": ra.active,
                "created_at": ra.created_at,
            }
            for ra, u in results
        ]
        return items, len(items)

    def list_all_store_admins(self, store_id: UUID | None, scope: Scope) -> tuple[list[dict], int]:
        if scope.role != "system_admin":
            raise DomainError(
                "forbidden", "Only system administrators can list all store administrators.", 403
            )
        query = (
            select(RoleAssignment, User, Store)
            .join(User, RoleAssignment.user_id == User.id)
            .join(Store, RoleAssignment.store_id == Store.id)
            .where(RoleAssignment.role == "store_admin")
        )
        if store_id:
            query = query.where(RoleAssignment.store_id == store_id)
        results = self.db.execute(query).all()
        items = [
            {
                "id": ra.id,
                "user_id": u.id,
                "email": u.email,
                "display_name": u.display_name,
                "store_id": st.id,
                "store_name": st.name,
                "role": ra.role,
                "active": ra.active,
                "created_at": ra.created_at,
            }
            for ra, u, st in results
        ]
        return items, len(items)

    def update_store(self, store_id: UUID, payload: StoreUpdate, scope: Scope) -> Store:
        if scope.role != "system_admin":
            raise DomainError("forbidden", "Only system administrators can update stores.", 403)

        store = _store_in_scope(self.db, store_id, scope)

        if payload.name is not None:
            store.name = payload.name.strip()
        if payload.timezone is not None:
            store.timezone = payload.timezone.strip()
        if payload.latitude is not None:
            store.latitude = payload.latitude
        if payload.longitude is not None:
            store.longitude = payload.longitude
        if payload.map_url is not None:
            store.map_url = payload.map_url.strip() if payload.map_url else None
        if payload.radius_meters is not None:
            store.radius_meters = payload.radius_meters
        if payload.active is not None:
            store.active = payload.active

        self.db.commit()
        self.db.refresh(store)
        return store
