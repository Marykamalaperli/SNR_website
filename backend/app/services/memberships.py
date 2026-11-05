from typing import Annotated, Protocol

import httpx
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import Settings, get_settings
from app.core.errors import DomainError
from app.core.security import bearer
from app.schemas.session import Identity, Membership


class MembershipRepository(Protocol):
    def resolve(self, identity: Identity) -> Membership:
        """Load active, server-owned role, organization, team and site assignments."""
        ...


class UnconfiguredMembershipRepository:
    def resolve(self, identity: Identity) -> Membership:
        # Never synthesize access from JWT user_metadata or a role requested by the browser.
        raise DomainError(
            "authorization_unavailable",
            "Your workspace is not ready yet. Contact your administrator.",
            503,
        )


class SupabaseMembershipRepository:
    def __init__(self, settings: Settings, token: str, transport=None):
        self.settings = settings
        self.token = token
        self.transport = transport

    def resolve(self, identity: Identity) -> Membership:
        try:
            with httpx.Client(
                timeout=10, transport=self.transport, follow_redirects=False
            ) as client:
                response = client.post(
                    f"{self.settings.supabase_url}/rest/v1/rpc/current_workspace",
                    headers={
                        "apikey": self.settings.supabase_publishable_key,
                        "Authorization": f"Bearer {self.token}",
                    },
                    json={},
                )
        except httpx.HTTPError as exc:
            raise DomainError(
                "authorization_unavailable",
                "Your workspace could not be reached. Please try again.",
                503,
            ) from exc
        if response.status_code == 401:
            raise DomainError("invalid_token", "Your session has expired. Sign in again.", 401)
        if response.status_code == 403:
            raise DomainError(
                "workspace_not_assigned",
                "Your account has no active workspace assignment. Contact your administrator.",
                403,
            )
        if response.status_code == 409:
            raise DomainError(
                "workspace_selection_required",
                "More than one workspace is assigned. Contact your administrator.",
                409,
            )
        if not response.is_success:
            raise DomainError(
                "authorization_unavailable",
                "Your workspace is not ready yet. Contact your administrator.",
                503,
            )
        try:
            membership = Membership.model_validate(response.json())
        except (ValueError, TypeError) as exc:
            raise DomainError(
                "authorization_unavailable", "Your workspace could not be verified.", 503
            ) from exc
        if membership.user_id != identity.user_id:
            raise DomainError("forbidden", "Your workspace could not be verified.", 403)
        return membership


def get_membership_repository(
    settings: Annotated[Settings, Depends(get_settings)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> MembershipRepository:
    if settings.supabase_url and settings.supabase_publishable_key and credentials:
        return SupabaseMembershipRepository(settings, credentials.credentials)
    return UnconfiguredMembershipRepository()
