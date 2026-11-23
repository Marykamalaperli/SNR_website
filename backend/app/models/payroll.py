from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    LargeBinary,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.identity import Base


class PayPeriod(Base):
    __tablename__ = "pay_periods"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "start_date", "end_date", name="uq_pay_periods_org_dates"
        ),
        CheckConstraint("start_date <= end_date", name="ck_pay_periods_dates"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    cutoff_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PayrollConfiguration(Base):
    __tablename__ = "payroll_configurations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
        UniqueConstraint(
            "organization_id",
            "employee_id",
            "effective_from",
            name="uq_payroll_config_emp_effective",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    employee_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    daily_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    store_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("stores.id"), nullable=True, index=True
    )
    pay_period_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pay_periods.id"), index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    watermark: Mapped[str] = mapped_column(String(64), default="Draft - Not for payment")
    input_hash: Mapped[str] = mapped_column(String(64))
    input_snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    total_gross_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    total_net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    total_payable_minutes: Mapped[int] = mapped_column(Integer, default=0)
    total_employees: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["PayrollItem"]] = relationship("PayrollItem", back_populates="payroll_run")
    payslips: Mapped[list["Payslip"]] = relationship("Payslip", back_populates="payroll_run")


class PayrollItem(Base):
    __tablename__ = "payroll_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
        UniqueConstraint("payroll_run_id", "employee_id", name="uq_payroll_items_run_employee"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    payroll_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payroll_runs.id"), index=True
    )
    employee_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    employee_code: Mapped[str] = mapped_column(String(64))
    employee_name: Mapped[str] = mapped_column(String(160))
    payable_minutes: Mapped[int] = mapped_column(Integer, default=0)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    gross_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    earnings_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    deductions_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    unresolved_exceptions_count: Mapped[int] = mapped_column(Integer, default=0)
    watermark: Mapped[str] = mapped_column(String(64), default="Draft - Not for payment")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    payroll_run: Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="items")
    payslip: Mapped["Payslip | None"] = relationship("Payslip", back_populates="payroll_item")


class Payslip(Base):
    __tablename__ = "payslips"
    __table_args__ = (
        UniqueConstraint("payroll_item_id", name="uq_payslips_payroll_item"),
        ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    payroll_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payroll_runs.id"), index=True
    )
    payroll_item_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payroll_items.id"), index=True
    )
    employee_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    period_name: Mapped[str] = mapped_column(String(100))
    gross_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(32), default="generated", index=True)
    object_key: Mapped[str] = mapped_column(String(512))
    pdf_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    payroll_run: Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="payslips")
    payroll_item: Mapped["PayrollItem"] = relationship("PayrollItem", back_populates="payslip")


class PayrollAuditLog(Base):
    __tablename__ = "payroll_audit_logs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), index=True
    )
    payroll_run_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(64))
    details: Mapped[str] = mapped_column(String(1024))
    performed_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
