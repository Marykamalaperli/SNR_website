from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import require_current_user, require_role
from app.schemas.auth import CurrentUser
from app.services.reports import ReportsService

router = APIRouter(prefix="/reports", tags=["reports"])

ATTENDANCE_REPORT_ROLES = {"store_admin", "hr_payroll", "system_admin", "auditor"}
PAYROLL_REPORT_ROLES = {"hr_payroll", "system_admin", "auditor"}


@router.get("/attendance.csv")
def download_attendance_report(
    from_date: Annotated[date, Query(description="Start date of report period")],
    to_date: Annotated[date, Query(description="End date of report period")],
    store_id: Annotated[UUID | None, Query(description="Optional store filter")] = None,
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    user = require_role(current, ATTENDANCE_REPORT_ROLES)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in ATTENDANCE_REPORT_ROLES:
            scope = s
            break

    csv_content = ReportsService(db, settings).export_attendance_csv(
        scope=scope,
        current_user=user,
        from_date=from_date,
        to_date=to_date,
        store_id=store_id,
    )

    filename = f"attendance-report-{from_date}-to-{to_date}.csv"
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/payroll.csv")
def download_payroll_report(
    payroll_run_id: Annotated[UUID, Query(description="Payroll run identifier")],
    current: CurrentUser = Depends(require_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    user = require_role(current, PAYROLL_REPORT_ROLES)
    scope = user.scopes[0]
    for s in user.scopes:
        if s.role in PAYROLL_REPORT_ROLES:
            scope = s
            break

    csv_content = ReportsService(db, settings).export_payroll_csv(
        scope=scope,
        current_user=user,
        payroll_run_id=payroll_run_id,
    )

    filename = f"payroll-run-{payroll_run_id}.csv"
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
