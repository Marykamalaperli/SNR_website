from datetime import date, datetime, time
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
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.identity import Base


class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (
        UniqueConstraint("store_id", "code"),
        UniqueConstraint("id", "organization_id"),
        ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    store_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(160))
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    break_minutes: Mapped[int] = mapped_column(default=0)
    is_overnight: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"
    __table_args__ = (
        CheckConstraint("effective_from <= effective_until", name="ck_shift_assignment_dates"),
        ForeignKeyConstraint(
            ["employee_id", "organization_id"],
            ["employees.id", "employees.organization_id"],
        ),
        ForeignKeyConstraint(
            ["shift_id", "organization_id"],
            ["shifts.id", "shifts.organization_id"],
        ),
        Index(
            "ix_shift_assignments_employee_dates",
            "employee_id",
            "effective_from",
            "effective_until",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    employee_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    shift_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_until: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
