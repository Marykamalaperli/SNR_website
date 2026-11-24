from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# --- Employee schemas ---


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=160)
    home_store_id: UUID
    user_id: UUID | None = None
    hire_date: date
    status: Literal["active", "deactivated"] = "active"
    email: EmailStr | None = None
    role: str | None = None


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
    login_email: str | None = None
    temporary_password: str | None = None


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


# --- Store schemas ---


class StoreCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=160)
    timezone: str = Field(default="Asia/Kolkata", min_length=1, max_length=64)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    map_url: str | None = Field(default=None, max_length=4096)
    radius_meters: int | None = Field(default=50, ge=10, le=5000)


class StoreUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=160)
    timezone: str | None = Field(None, min_length=1, max_length=64)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    map_url: str | None = Field(default=None, max_length=4096)
    radius_meters: int | None = Field(default=None, ge=10, le=5000)
    active: bool | None = None


class StoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    code: str
    name: str
    timezone: str
    latitude: float | None = None
    longitude: float | None = None
    map_url: str | None = None
    radius_meters: int | None = 50
    active: bool
    created_at: datetime


class StoreListOut(BaseModel):
    items: list[StoreOut]
    total: int


class StoreAdminCreate(BaseModel):
    store_id: UUID | None = None
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8, max_length=128)


class StoreAdminOut(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    display_name: str
    store_id: UUID
    store_name: str
    role: str
    active: bool
    created_at: datetime


class StoreAdminListOut(BaseModel):
    items: list[StoreAdminOut]
    total: int
