from typing import Protocol

from app.core.errors import DomainError
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


def get_membership_repository() -> MembershipRepository:
    return UnconfiguredMembershipRepository()
