from fastapi import APIRouter, Depends

from app.core.security import require_identity
from app.schemas.session import Identity, Membership
from app.services.memberships import MembershipRepository, get_membership_repository

router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["health"])
def versioned_health() -> dict[str, str]:
    return {"status": "ok", "service": "snr-nest-api", "version": "1"}


@router.get("/session", response_model=Membership, tags=["auth"])
def session(
    identity: Identity = Depends(require_identity),
    repository: MembershipRepository = Depends(get_membership_repository),
) -> Membership:
    return repository.resolve(identity)
