from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

RoleName = Literal["employee", "store_admin", "hr_payroll", "system_admin", "auditor"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class Scope(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: RoleName
    organization_id: UUID | None = None
    store_id: UUID | None = None


class CurrentUser(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    email: EmailStr
    display_name: str
    scopes: tuple[Scope, ...]


class SessionResult(BaseModel):
    status: Literal["authenticated", "refreshed", "logged_out"]
