from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Identity(BaseModel):
    model_config = ConfigDict(frozen=True)
    user_id: UUID


class Membership(BaseModel):
    """Resolved from trusted database assignments, never client metadata."""

    model_config = ConfigDict(frozen=True)
    user_id: UUID
    organization_id: UUID
    organization_name: str | None = None
    display_name: str | None = None
    role: Literal["employee", "supervisor", "hr", "security_auditor", "system_owner"]
    employee_id: UUID | None = None
    team_ids: tuple[UUID, ...] = ()
    site_ids: tuple[UUID, ...] = ()
