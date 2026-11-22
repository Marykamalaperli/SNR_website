from datetime import datetime
from typing import Literal
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
