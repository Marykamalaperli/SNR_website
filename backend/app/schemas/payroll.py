from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PayPeriodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_date: date
    end_date: date
    cutoff_date: date


class PayPeriodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    start_date: date
    end_date: date
    cutoff_date: date
    status: str
    created_at: datetime
    updated_at: datetime


class PayrollConfigCreate(BaseModel):
    employee_id: UUID
    hourly_rate: Decimal = Field(gt=0, decimal_places=2)
    daily_rate: Decimal | None = Field(default=None, decimal_places=2)
    effective_from: date
    effective_until: date | None = None


class PayrollConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    employee_id: UUID
    hourly_rate: Decimal
    daily_rate: Decimal | None
    effective_from: date
    effective_until: date | None
    created_at: datetime


class CalculateDraftRunRequest(BaseModel):
    pay_period_id: UUID
    store_id: UUID | None = None
    block_unresolved_exceptions: bool = True


class PayrollRunApproveRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=512)


class PayrollRunReverseRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=512)


class PayrollItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    payroll_run_id: UUID
    employee_id: UUID
    employee_code: str
    employee_name: str
    payable_minutes: int
    hourly_rate: Decimal
    gross_pay: Decimal
    net_pay: Decimal
    earnings_json: list[dict[str, Any]]
    deductions_json: list[dict[str, Any]]
    unresolved_exceptions_count: int
    watermark: str
    created_at: datetime


class PayrollRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    store_id: UUID | None
    pay_period_id: UUID
    version: int
    status: str
    watermark: str
    input_hash: str
    total_gross_pay: Decimal
    total_net_pay: Decimal
    total_payable_minutes: int
    total_employees: int
    created_at: datetime
    locked_at: datetime | None = None
    items: list[PayrollItemOut] | None = None


class PayrollRunPreviewOut(BaseModel):
    id: UUID
    organization_id: UUID
    pay_period_id: UUID
    status: str
    watermark: str
    input_hash: str
    total_gross_pay: Decimal
    total_net_pay: Decimal
    total_payable_minutes: int
    total_employees: int
    unresolved_exceptions_total: int
    reconciles: bool
    blockers: list[str]


class PayslipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    payroll_run_id: UUID
    payroll_item_id: UUID
    employee_id: UUID
    period_name: str
    gross_pay: Decimal
    net_pay: Decimal
    currency: str
    status: str
    released_at: datetime | None
    created_at: datetime


class PayslipDownloadIntentOut(BaseModel):
    payslip_id: UUID
    download_url: str
    expires_at: datetime
    filename: str


class PayrollAuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    payroll_run_id: UUID | None
    action: str
    details: str
    performed_by: UUID
    created_at: datetime
