import csv
import io
import json
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import DomainError
from app.models.attendance import AttendanceDay
from app.models.identity import Employee, Organization, Store
from app.models.payroll import PayPeriod, PayrollAuditLog, PayrollItem, PayrollRun
from app.schemas.auth import CurrentUser, Scope

# Formula injection trigger characters (CWE-1236)
DANGEROUS_CSV_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_csv_cell(val: Any) -> str:
    """Neutralize formula injection by prefixing dangerous characters with single quote."""
    if val is None:
        return ""
    text = str(val)
    if text.startswith(DANGEROUS_CSV_PREFIXES):
        return f"'{text}"
    return text


class ReportsService:
    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = settings

    def export_attendance_csv(
        self,
        scope: Scope,
        current_user: CurrentUser,
        from_date: date,
        to_date: date,
        store_id: UUID | None = None,
    ) -> str:
        if from_date > to_date:
            raise DomainError("invalid_date_range", "from_date must be on or before to_date.", 400)

        # Build query scoped to user permissions
        query = (
            select(AttendanceDay, Employee, Store)
            .join(Employee, AttendanceDay.employee_id == Employee.id)
            .join(Store, AttendanceDay.store_id == Store.id)
            .where(
                AttendanceDay.work_date >= from_date,
                AttendanceDay.work_date <= to_date,
            )
        )

        if scope.role != "system_admin":
            query = query.where(AttendanceDay.organization_id == scope.organization_id)
            if scope.store_id is not None:
                query = query.where(AttendanceDay.store_id == scope.store_id)
            elif store_id is not None:
                query = query.where(AttendanceDay.store_id == store_id)
        elif store_id is not None:
            query = query.where(AttendanceDay.store_id == store_id)

        query = query.order_by(
            AttendanceDay.work_date.asc(), Store.code.asc(), Employee.employee_code.asc()
        )
        records = self.db.execute(query).all()

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Header metadata comment
        output.write(f"# SNR NEST Attendance Export: {from_date} to {to_date}\n")

        headers = [
            "Work Date",
            "Store Code",
            "Store Name",
            "Employee Code",
            "Employee Name",
            "First In (UTC)",
            "Last Out (UTC)",
            "Payable Hours",
            "Missing Punch",
            "Late (mins)",
            "Early Departure (mins)",
            "Overtime (mins)",
            "Status",
            "Version",
        ]
        writer.writerow(headers)

        for day, emp, store in records:
            payable_hours = f"{day.payable_minutes / 60:.2f}"
            first_in = day.first_in.strftime("%Y-%m-%d %H:%M:%S") if day.first_in else ""
            last_out = day.last_out.strftime("%Y-%m-%d %H:%M:%S") if day.last_out else ""

            row = [
                sanitize_csv_cell(day.work_date.isoformat()),
                sanitize_csv_cell(store.code),
                sanitize_csv_cell(store.name),
                sanitize_csv_cell(emp.employee_code),
                sanitize_csv_cell(emp.display_name),
                sanitize_csv_cell(first_in),
                sanitize_csv_cell(last_out),
                sanitize_csv_cell(payable_hours),
                sanitize_csv_cell("YES" if day.is_missing_punch else "NO"),
                sanitize_csv_cell(day.late_minutes),
                sanitize_csv_cell(day.early_departure_minutes),
                sanitize_csv_cell(day.overtime_minutes),
                sanitize_csv_cell(day.status),
                sanitize_csv_cell(day.version),
            ]
            writer.writerow(row)

        # Log audit trail
        org_id = scope.organization_id or (records[0][0].organization_id if records else None)
        if org_id:
            audit = PayrollAuditLog(
                id=uuid4(),
                organization_id=org_id,
                payroll_run_id=None,
                action="attendance_report_exported",
                details=json.dumps(
                    {
                        "report_type": "attendance_csv",
                        "from_date": str(from_date),
                        "to_date": str(to_date),
                        "store_id": str(store_id) if store_id else None,
                        "record_count": len(records),
                    }
                ),
                performed_by=current_user.user_id,
                created_at=datetime.now(UTC),
            )
            self.db.add(audit)
            self.db.commit()

        return output.getvalue()

    def export_payroll_csv(
        self,
        scope: Scope,
        current_user: CurrentUser,
        payroll_run_id: UUID,
    ) -> str:
        run = self.db.get(PayrollRun, payroll_run_id)
        if not run:
            raise DomainError("not_found", "Payroll run not found.", 404)

        if scope.role != "system_admin" and run.organization_id != scope.organization_id:
            raise DomainError("forbidden", "Payroll run outside authorized scope.", 403)

        period = self.db.get(PayPeriod, run.pay_period_id)
        org = self.db.get(Organization, run.organization_id)
        currency = org.currency if org else "INR"
        query = (
            select(PayrollItem, Employee)
            .join(Employee, PayrollItem.employee_id == Employee.id)
            .where(PayrollItem.payroll_run_id == payroll_run_id)
            .order_by(Employee.employee_code.asc())
        )
        items = self.db.execute(query).all()

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Statutory and compliance watermark header
        output.write("# WATERMARK: Draft - Not for payment\n")
        output.write(f"# SNR NEST Payroll Export - Run {run.id}\n")

        headers = [
            "Run ID",
            "Period Start",
            "Period End",
            "Employee Code",
            "Employee Name",
            "Currency",
            "Base Pay",
            "Gross Pay",
            "Total Deductions",
            "Net Pay",
            "Payable Hours",
            "Exceptions Count",
            "Input Hash",
            "Status",
        ]
        writer.writerow(headers)

        for item, emp in items:
            hours = f"{item.payable_minutes / 60:.2f}"
            deductions = f"{item.gross_pay - item.net_pay:.2f}"
            row = [
                sanitize_csv_cell(str(run.id)),
                sanitize_csv_cell(str(period.start_date) if period else ""),
                sanitize_csv_cell(str(period.end_date) if period else ""),
                sanitize_csv_cell(emp.employee_code),
                sanitize_csv_cell(emp.display_name),
                sanitize_csv_cell(currency),
                sanitize_csv_cell(str(item.gross_pay)),
                sanitize_csv_cell(str(item.gross_pay)),
                sanitize_csv_cell(deductions),
                sanitize_csv_cell(str(item.net_pay)),
                sanitize_csv_cell(hours),
                sanitize_csv_cell(item.unresolved_exceptions_count),
                sanitize_csv_cell(run.input_hash[:16] if run.input_hash else ""),
                sanitize_csv_cell(run.status),
            ]
            writer.writerow(row)

        # Write audit trail
        audit = PayrollAuditLog(
            id=uuid4(),
            organization_id=run.organization_id,
            payroll_run_id=run.id,
            action="payroll_report_exported",
            details=json.dumps(
                {
                    "report_type": "payroll_csv",
                    "payroll_run_id": str(run.id),
                    "item_count": len(items),
                    "input_hash": run.input_hash,
                }
            ),
            performed_by=current_user.user_id,
            created_at=datetime.now(UTC),
        )
        self.db.add(audit)
        self.db.commit()

        return output.getvalue()
