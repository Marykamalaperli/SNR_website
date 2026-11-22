from fastapi import APIRouter, Depends

from app.core.database import ReadinessChecker, get_readiness_checker
from app.core.errors import DomainError
from app.core.security import require_identity
from app.schemas.session import Identity, Membership
from app.services.memberships import MembershipRepository, get_membership_repository

router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["health"])
def versioned_health() -> dict[str, str]:
    return {"status": "ok", "service": "snr-nest-api", "version": "1"}


@router.get("/ready", tags=["health"])
def readiness(
    checker: ReadinessChecker = Depends(get_readiness_checker),
) -> dict[str, str]:
    if not checker.check():
        raise DomainError("database_unavailable", "The service is not ready.", 503)
    return {"status": "ready", "service": "snr-nest-api", "database": "available"}


@router.get("/session", response_model=Membership, tags=["auth"])
def session(
    identity: Identity = Depends(require_identity),
    repository: MembershipRepository = Depends(get_membership_repository),
) -> Membership:
    return repository.resolve(identity)
