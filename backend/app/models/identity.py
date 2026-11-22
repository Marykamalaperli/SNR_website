from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy import (
    text as sa_text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160))
    default_timezone: Mapped[str] = mapped_column(String(64))
    currency: Mapped[str] = mapped_column(String(3))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Store(Base):
    __tablename__ = "stores"
    __table_args__ = (
        UniqueConstraint("organization_id", "code"),
        UniqueConstraint("id", "organization_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(160))
    timezone: Mapped[str] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="ck_users_email_normalized"),
        CheckConstraint("status IN ('active', 'deactivated')", name="ck_users_status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="active")
    token_version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RoleAssignment(Base):
    __tablename__ = "role_assignments"
    __table_args__ = (
        CheckConstraint(
            "role IN ('employee', 'store_admin', 'hr_payroll', 'system_admin', 'auditor')",
            name="ck_role_assignments_role",
        ),
        CheckConstraint(
            "(role = 'system_admin' AND organization_id IS NULL AND store_id IS NULL) OR "
            "(role IN ('hr_payroll', 'auditor') AND organization_id IS NOT NULL "
            "AND store_id IS NULL) OR "
            "(role IN ('employee', 'store_admin') AND organization_id IS NOT NULL "
            "AND store_id IS NOT NULL)",
            name="ck_role_assignments_scope",
        ),
        UniqueConstraint("user_id", "role", "organization_id", "store_id"),
        ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
        Index(
            "uq_role_assignments_global",
            "user_id",
            "role",
            unique=True,
            postgresql_where=(sa_text("role = 'system_admin'")),
        ),
        Index(
            "uq_role_assignments_organization",
            "user_id",
            "role",
            "organization_id",
            unique=True,
            postgresql_where=(sa_text("store_id IS NULL AND organization_id IS NOT NULL")),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(32))
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True, index=True
    )
    store_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("organization_id", "employee_code"),
        UniqueConstraint("id", "organization_id"),
        CheckConstraint("status IN ('active', 'deactivated')", name="ck_employees_status"),
        ForeignKeyConstraint(
            ["home_store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    home_store_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=True
    )
    employee_code: Mapped[str] = mapped_column(String(64))
    display_name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(16), default="active")
    hire_date: Mapped[date] = mapped_column(Date)
    exit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Session(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), index=True)
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    refresh_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    token_version: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
