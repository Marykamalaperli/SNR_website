from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StoreQRChallengeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    challenge_token: str
    store_id: UUID
    expires_at: datetime


class PhotoUploadIntentRequest(BaseModel):
    store_id: UUID
    content_type: str = Field(default="image/jpeg", pattern=r"^image/(jpeg|png)$")


class PhotoUploadIntentOut(BaseModel):
    upload_url: str
    photo_key: str
    expires_in: int
    max_bytes: int


class AttendanceEventRequest(BaseModel):
    challenge_token: str
    action: Literal["clock_in", "clock_out"]
    photo_key: str = Field(min_length=10, max_length=512)
    location_latitude: float | None = Field(None, ge=-90.0, le=90.0)
    location_longitude: float | None = Field(None, ge=-180.0, le=180.0)
    location_accuracy: float | None = Field(None, ge=0.0)
    device_info: str | None = Field(None, max_length=256)


class AttendanceEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    store_id: UUID
    employee_id: UUID
    shift_id: UUID | None
    action: str
    server_timestamp: datetime
    store_timestamp: datetime
    photo_key: str


class AttendanceEventListOut(BaseModel):
    items: list[AttendanceEventOut]
    total: int


class AttendanceDayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    store_id: UUID
    employee_id: UUID
    work_date: date
    shift_id: UUID | None = None
    first_in: datetime | None = None
    last_out: datetime | None = None
    payable_minutes: int = 0
    status: str
    is_missing_punch: bool = False
    is_late: bool = False
    is_early_departure: bool = False
    is_overtime: bool = False
    late_minutes: int = 0
    early_departure_minutes: int = 0
    overtime_minutes: int = 0
    version: int = 1
    created_at: datetime
    updated_at: datetime
    employee_name: str | None = None
    employee_code: str | None = None
    store_name: str | None = None


class AttendanceDayListOut(BaseModel):
    items: list[AttendanceDayOut]
    total: int


class AttendanceAdjustmentCreate(BaseModel):
    first_in: datetime | None = None
    last_out: datetime | None = None
    reason: str = Field(min_length=5, max_length=512)
    expected_version: int = Field(ge=1)


class AttendanceAdjustmentReview(BaseModel):
    action: Literal["approve", "reject"]
    review_note: str | None = Field(None, max_length=512)


class AttendanceAdjustmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    attendance_day_id: UUID
    before_json: dict[str, Any]
    after_json: dict[str, Any]
    reason: str
    status: str
    requested_by: UUID
    approved_by: UUID | None = None
    review_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
