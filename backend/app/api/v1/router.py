from fastapi import APIRouter, Depends

from app.api.v1.attendance import router as attendance_router
from app.api.v1.auth import router as auth_router
from app.api.v1.payroll import router as payroll_router
from app.api.v1.payslips import router as payslips_router
from app.api.v1.reports import router as reports_router
from app.api.v1.workforce import router as workforce_router
from app.core.database import ReadinessChecker, get_readiness_checker
from app.core.errors import DomainError
from app.core.security import require_current_user
from app.schemas.auth import CurrentUser

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


router.include_router(auth_router)
router.include_router(workforce_router)
router.include_router(attendance_router)
router.include_router(payroll_router)
router.include_router(payslips_router)
router.include_router(reports_router)


@router.get("/me", response_model=CurrentUser, tags=["auth"])
def me(current: CurrentUser = Depends(require_current_user)) -> CurrentUser:
    return current
