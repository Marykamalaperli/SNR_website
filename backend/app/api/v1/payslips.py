from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import require_current_user, require_role
from app.schemas.auth import CurrentUser, Scope
from app.schemas.payroll import (
    PayslipDownloadIntentOut,
    PayslipOut,
)
from app.services.payroll import PayrollService

router = APIRouter(prefix="/payslips", tags=["payslips"])


def _get_active_scope(current: CurrentUser) -> Scope:
    return current.scopes[0]


@router.get("/me", response_model=list[PayslipOut])
def get_my_payslips(
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> list[PayslipOut]:
    """Employee view of their own released payslips."""
    require_role(current, {"employee", "hr_payroll", "system_admin"})
    scope = _get_active_scope(current)
    service = PayrollService(db, settings)
    return service.list_my_payslips(scope, current.user_id)


@router.post("/{payslip_id}/download-intent", response_model=PayslipDownloadIntentOut)
def create_payslip_download_intent(
    payslip_id: UUID,
    current: Annotated[CurrentUser, Depends(require_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PayslipDownloadIntentOut:
    """Generate a short-lived, signed download token for authorized payslips."""
    scope = _get_active_scope(current)
    service = PayrollService(db, settings)
    return service.create_download_intent(scope, current.user_id, payslip_id)


@router.get("/download/{token}")
def download_payslip_file(
    token: str,
    db: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """Download verified PDF file using signed, short-lived token."""
    service = PayrollService(db, settings)
    payslip, pdf_bytes = service.get_payslip_by_token(token)

    safe_name = payslip.period_name.replace(" ", "_")
    filename = f"payslip_{safe_name}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
    )
