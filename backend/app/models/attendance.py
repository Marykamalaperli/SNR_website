from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.identity import Base


class AttendanceChallenge(Base):
    __tablename__ = "attendance_challenges"
    __table_args__ = (
        UniqueConstraint("challenge_token"),
        ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    store_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    challenge_token: Mapped[str] = mapped_column(String(256), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"
    __table_args__ = (
        CheckConstraint("action IN ('clock_in', 'clock_out')", name="ck_attendance_action"),
        UniqueConstraint(
            "organization_id",
            "employee_id",
            "idempotency_key",
            name="uq_attendance_events_idempotency",
        ),
        ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
        ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
        Index("ix_attendance_events_employee_time", "employee_id", "server_timestamp"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    store_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    employee_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    shift_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("shifts.id"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(16))
    idempotency_key: Mapped[str] = mapped_column(String(64))
    server_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    store_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    photo_key: Mapped[str] = mapped_column(String(512))
    location_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    device_info: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AttendanceAuditLog(Base):
    __tablename__ = "attendance_audit_logs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    event_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("attendance_events.id"), nullable=True, index=True
    )
    employee_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("employees.id"), index=True
    )
    action: Mapped[str] = mapped_column(String(32))
    details: Mapped[str] = mapped_column(String(1024))
    performed_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
