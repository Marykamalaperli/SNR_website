from datetime import date, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# --- Employee schemas ---


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=160)
    home_store_id: UUID
    user_id: UUID | None = None
    hire_date: date
    status: Literal["active", "deactivated"] = "active"


class EmployeeUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=160)
    home_store_id: UUID | None = None
    status: Literal["active", "deactivated"] | None = None
    exit_date: date | None = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    home_store_id: UUID
    user_id: UUID | None
    employee_code: str
    display_name: str
    status: str
    hire_date: date
    exit_date: date | None


class EmployeeListOut(BaseModel):
    items: list[EmployeeOut]
    total: int


# --- Shift schemas ---


class ShiftCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=160)
    store_id: UUID
    start_time: time
    end_time: time
    break_minutes: int = Field(default=0, ge=0, le=480)
    is_overnight: bool = False


class ShiftUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=160)
    start_time: time | None = None
    end_time: time | None = None
    break_minutes: int | None = Field(None, ge=0, le=480)
    is_overnight: bool | None = None
    active: bool | None = None


class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    store_id: UUID
    code: str
    name: str
    start_time: time
    end_time: time
    break_minutes: int
    is_overnight: bool
    active: bool


class ShiftListOut(BaseModel):
    items: list[ShiftOut]
    total: int


# --- Shift assignment schemas ---


class AssignmentCreate(BaseModel):
    employee_id: UUID
    shift_id: UUID
    effective_from: date
    effective_until: date


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    employee_id: UUID
    shift_id: UUID
    effective_from: date
    effective_until: date


class AssignmentListOut(BaseModel):
    items: list[AssignmentOut]
    total: int
