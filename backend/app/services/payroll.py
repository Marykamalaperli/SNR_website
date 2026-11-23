import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import Settings
from app.core.errors import DomainError
from app.models.attendance import AttendanceAdjustment, AttendanceDay
from app.models.identity import Employee, Organization, Store
from app.models.payroll import (
    PayPeriod,
    PayrollAuditLog,
    PayrollConfiguration,
    PayrollItem,
    PayrollRun,
    Payslip,
)
from app.schemas.auth import Scope
from app.schemas.payroll import (
    CalculateDraftRunRequest,
    PayPeriodCreate,
    PayrollConfigCreate,
    PayrollRunPreviewOut,
    PayslipDownloadIntentOut,
)

WATERMARK_TEXT = "Draft - Not for payment"


def generate_payslip_pdf(
    org_name: str,
    period_name: str,
    employee_name: str,
    employee_code: str,
    hours: str,
    hourly_rate: str,
    gross_pay: str,
    net_pay: str,
    currency: str,
    status: str,
    watermark: str,
    input_hash: str,
) -> bytes:
    """Generate a clean, standard-compliant PDF-1.4 payslip document in pure Python."""
    lines = [
        "SNR NEST - OFFICIAL WORKFORCE SYSTEM",
        f"ORGANIZATION: {org_name}",
        "----------------------------------------------------------------",
        f"STATUS: {status.upper()} - {watermark}",
        "----------------------------------------------------------------",
        f"PAY PERIOD: {period_name}",
        f"EMPLOYEE:   {employee_name} ({employee_code})",
        f"DATE:       {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}",
        "----------------------------------------------------------------",
        "EARNINGS BREAKDOWN:",
        f"  Base Hourly Pay: {hours} hours @ {hourly_rate} {currency}/hr",
        f"  Gross Pay:       {gross_pay} {currency}",
        "----------------------------------------------------------------",
        "DEDUCTIONS: (Draft - statutory compliance rules pending)",
        f"  Total Deductions: 0.00 {currency}",
        "----------------------------------------------------------------",
        f"NET PAYABLE AMOUNT: {net_pay} {currency}",
        "----------------------------------------------------------------",
        f"INPUT SHA-256 HASH: {input_hash[:32]}...",
        "VERIFICATION: Deterministic calculation verified by SNR NEST.",
        "NOTICE: Private and confidential document. Authorized access only.",
    ]

    content = "BT\n/F1 11 Tf\n50 740 Td\n18 TL\n"
    for line in lines:
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content += f"({safe}) ' \n"
    content += "ET\n"
    stream_bytes = content.encode("latin1")

    objs = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
        ),
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        (
            f"5 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin1")
            + stream_bytes
            + b"\nendstream\nendobj\n"
        ),
    ]

    out = [b"%PDF-1.4\n"]
    offsets = [0]
    for obj in objs:
        offsets.append(sum(len(x) for x in out))
        out.append(obj)

    xref_pos = sum(len(x) for x in out)
    out.append(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("latin1"))
    for off in offsets[1:]:
        out.append(f"{off:010d} 00000 n \n".encode("latin1"))
    out.append(
        f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "latin1"
        )
    )
    return b"".join(out)


class PayrollService:
    def __init__(self, db: Session, settings: Settings | None = None):
        self.db = db
        self.settings = settings or Settings()

    def _verify_hr_or_admin(self, scope: Scope) -> None:
        if scope.role not in ("hr_payroll", "system_admin"):
            raise DomainError(
                "forbidden", "Only HR/Payroll or System Admin can manage payroll.", 403
            )

    def _verify_org_scope(self, scope: Scope, organization_id: UUID) -> None:
        if scope.role != "system_admin" and scope.organization_id != organization_id:
            raise DomainError(
                "forbidden", "Record outside your authorized organization scope.", 403
            )

    # 1. Pay Periods
    def create_pay_period(self, scope: Scope, payload: PayPeriodCreate) -> PayPeriod:
        self._verify_hr_or_admin(scope)
        if not scope.organization_id:
            raise DomainError("missing_organization", "Organization scope required.", 400)

        if payload.start_date > payload.end_date:
            raise DomainError("invalid_date_range", "Start date must not be after end date.", 422)

        existing = self.db.scalars(
            select(PayPeriod).where(
                PayPeriod.organization_id == scope.organization_id,
                PayPeriod.start_date == payload.start_date,
                PayPeriod.end_date == payload.end_date,
            )
        ).first()
        if existing:
            raise DomainError(
                "period_conflict", "A pay period already exists for these dates.", 409
            )

        now = datetime.now(UTC)
        period = PayPeriod(
            id=uuid4(),
            organization_id=scope.organization_id,
            name=payload.name,
            start_date=payload.start_date,
            end_date=payload.end_date,
            cutoff_date=payload.cutoff_date,
            status="open",
            created_at=now,
            updated_at=now,
        )
        self.db.add(period)
        self.db.commit()
        self.db.refresh(period)
        return period

    def list_pay_periods(self, scope: Scope, status: str | None = None) -> list[PayPeriod]:
        if scope.role not in ("hr_payroll", "system_admin", "auditor"):
            raise DomainError("forbidden", "Access denied.", 403)

        query = select(PayPeriod)
        if scope.role != "system_admin":
            query = query.where(PayPeriod.organization_id == scope.organization_id)
        if status:
            query = query.where(PayPeriod.status == status)
        query = query.order_by(PayPeriod.start_date.desc())
        return list(self.db.scalars(query).all())

    # 2. Payroll Configurations (Rates)
    def create_payroll_configuration(
        self, scope: Scope, user_id: UUID, payload: PayrollConfigCreate
    ) -> PayrollConfiguration:
        self._verify_hr_or_admin(scope)
        if not scope.organization_id:
            raise DomainError("missing_organization", "Organization scope required.", 400)

        employee = self.db.get(Employee, payload.employee_id)
        if not employee or employee.organization_id != scope.organization_id:
            raise DomainError("not_found", "Employee not found in organization.", 404)

        if payload.effective_until and payload.effective_from > payload.effective_until:
            raise DomainError(
                "invalid_date_range", "effective_from must be <= effective_until", 422
            )

        existing = self.db.scalars(
            select(PayrollConfiguration).where(
                PayrollConfiguration.organization_id == scope.organization_id,
                PayrollConfiguration.employee_id == payload.employee_id,
                PayrollConfiguration.effective_from == payload.effective_from,
            )
        ).first()
        if existing:
            raise DomainError(
                "config_conflict",
                "A configuration already exists for this effective date.",
                409,
            )

        now = datetime.now(UTC)
        config = PayrollConfiguration(
            id=uuid4(),
            organization_id=scope.organization_id,
            employee_id=payload.employee_id,
            hourly_rate=payload.hourly_rate,
            daily_rate=payload.daily_rate,
            effective_from=payload.effective_from,
            effective_until=payload.effective_until,
            created_by=user_id,
            created_at=now,
        )
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def list_payroll_configurations(
        self, scope: Scope, employee_id: UUID | None = None
    ) -> list[PayrollConfiguration]:
        self._verify_hr_or_admin(scope)
        query = select(PayrollConfiguration)
        if scope.role != "system_admin":
            query = query.where(PayrollConfiguration.organization_id == scope.organization_id)
        if employee_id:
            query = query.where(PayrollConfiguration.employee_id == employee_id)
        query = query.order_by(PayrollConfiguration.effective_from.desc())
        return list(self.db.scalars(query).all())

    def get_active_configuration(
        self, organization_id: UUID, employee_id: UUID, as_of_date: date
    ) -> PayrollConfiguration | None:
        return self.db.scalars(
            select(PayrollConfiguration)
            .where(
                PayrollConfiguration.organization_id == organization_id,
                PayrollConfiguration.employee_id == employee_id,
                PayrollConfiguration.effective_from <= as_of_date,
                (PayrollConfiguration.effective_until.is_(None))
                | (PayrollConfiguration.effective_until >= as_of_date),
            )
            .order_by(PayrollConfiguration.effective_from.desc())
        ).first()

    # 3. Deterministic Draft Calculation Engine
    def calculate_draft_run(
        self, scope: Scope, user_id: UUID, payload: CalculateDraftRunRequest
    ) -> PayrollRun:
        self._verify_hr_or_admin(scope)
        period = self.db.get(PayPeriod, payload.pay_period_id)
        if not period:
            raise DomainError("not_found", "Pay period not found.", 404)
        self._verify_org_scope(scope, period.organization_id)

        if period.status != "open":
            raise DomainError(
                "period_not_open",
                f"Pay period is {period.status}, only open periods can be calculated.",
                422,
            )

        org_id = period.organization_id

        emp_query = select(Employee).where(
            Employee.organization_id == org_id,
            Employee.status == "active",
        )
        if payload.store_id:
            store = self.db.get(Store, payload.store_id)
            if not store or store.organization_id != org_id:
                raise DomainError("not_found", "Store not found in organization.", 404)
            emp_query = emp_query.where(Employee.home_store_id == payload.store_id)

        employees = list(self.db.scalars(emp_query.order_by(Employee.employee_code)).all())
        if not employees:
            raise DomainError(
                "no_eligible_employees", "No active employees found to calculate payroll.", 422
            )

        run_id = uuid4()
        now = datetime.now(UTC)

        items: list[PayrollItem] = []
        canonical_items: list[dict] = []
        unresolved_employees_count = 0

        total_gross_pay = Decimal("0.00")
        total_net_pay = Decimal("0.00")
        total_payable_minutes = 0

        for emp in employees:
            rate_config = self.get_active_configuration(org_id, emp.id, period.end_date)
            if not rate_config:
                emp_name = emp.display_name
                raise DomainError(
                    "missing_rate_configuration",
                    f"Employee {emp_name} ({emp.employee_code}) has no active rate configuration.",
                    422,
                )

            days = list(
                self.db.scalars(
                    select(AttendanceDay).where(
                        AttendanceDay.organization_id == org_id,
                        AttendanceDay.employee_id == emp.id,
                        AttendanceDay.work_date >= period.start_date,
                        AttendanceDay.work_date <= period.end_date,
                    )
                ).all()
            )

            emp_unresolved_count = 0
            emp_payable_minutes = 0

            for day in days:
                emp_payable_minutes += day.payable_minutes
                is_unresolved = day.is_missing_punch or day.status == "missing_punch"
                if not is_unresolved:
                    pending_adj = self.db.scalars(
                        select(AttendanceAdjustment).where(
                            AttendanceAdjustment.attendance_day_id == day.id,
                            AttendanceAdjustment.status == "pending_approval",
                        )
                    ).first()
                    if pending_adj:
                        is_unresolved = True

                if is_unresolved:
                    emp_unresolved_count += 1

            if emp_unresolved_count > 0:
                unresolved_employees_count += 1

            hourly_rate = Decimal(str(rate_config.hourly_rate))
            hours_decimal = Decimal(emp_payable_minutes) / Decimal(60)
            gross_pay = (hours_decimal * hourly_rate).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            net_pay = gross_pay

            hours_str = str(hours_decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            earnings_json = [
                {
                    "component": "Base Hourly Pay",
                    "hours": hours_str,
                    "rate": str(hourly_rate),
                    "amount": str(gross_pay),
                }
            ]
            deductions_json: list[dict] = []

            item = PayrollItem(
                id=uuid4(),
                organization_id=org_id,
                payroll_run_id=run_id,
                employee_id=emp.id,
                employee_code=emp.employee_code,
                employee_name=emp.display_name,
                payable_minutes=emp_payable_minutes,
                hourly_rate=hourly_rate,
                gross_pay=gross_pay,
                net_pay=net_pay,
                earnings_json=earnings_json,
                deductions_json=deductions_json,
                unresolved_exceptions_count=emp_unresolved_count,
                watermark=WATERMARK_TEXT,
                created_at=now,
            )
            items.append(item)

            total_gross_pay += gross_pay
            total_net_pay += net_pay
            total_payable_minutes += emp_payable_minutes

            canonical_items.append(
                {
                    "employee_code": emp.employee_code,
                    "employee_id": str(emp.id),
                    "gross_pay": str(gross_pay),
                    "hourly_rate": str(hourly_rate),
                    "net_pay": str(net_pay),
                    "payable_minutes": emp_payable_minutes,
                    "unresolved_exceptions_count": emp_unresolved_count,
                }
            )

        if payload.block_unresolved_exceptions and unresolved_employees_count > 0:
            err_msg = (
                f"Cannot calculate payroll: unresolved attendance exceptions found for "
                f"{unresolved_employees_count} employee(s). Resolve all adjustments first."
            )
            raise DomainError("unresolved_attendance_exceptions", err_msg, 422)

        sum_gross = sum((it.gross_pay for it in items), Decimal("0.00"))
        sum_net = sum((it.net_pay for it in items), Decimal("0.00"))
        sum_minutes = sum(it.payable_minutes for it in items)
        if (
            sum_gross != total_gross_pay
            or sum_net != total_net_pay
            or sum_minutes != total_payable_minutes
        ):
            raise DomainError(
                "reconciliation_mismatch", "Internal reconciliation check failed.", 500
            )

        canonical_items.sort(key=lambda x: x["employee_id"])
        canonical_snapshot = {
            "organization_id": str(org_id),
            "pay_period_id": str(period.id),
            "period_start": period.start_date.isoformat(),
            "period_end": period.end_date.isoformat(),
            "store_id": str(payload.store_id) if payload.store_id else None,
            "items": canonical_items,
        }
        canonical_bytes = json.dumps(
            canonical_snapshot, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        input_hash = hashlib.sha256(canonical_bytes).hexdigest()

        payroll_run = PayrollRun(
            id=run_id,
            organization_id=org_id,
            store_id=payload.store_id,
            pay_period_id=period.id,
            version=1,
            status="draft",
            watermark=WATERMARK_TEXT,
            input_hash=input_hash,
            input_snapshot_json=canonical_snapshot,
            total_gross_pay=total_gross_pay,
            total_net_pay=total_net_pay,
            total_payable_minutes=total_payable_minutes,
            total_employees=len(items),
            created_by=user_id,
            created_at=now,
        )
        self.db.add(payroll_run)
        for item in items:
            self.db.add(item)

        self.db.commit()
        self.db.refresh(payroll_run)
        return payroll_run

    def get_payroll_run(self, scope: Scope, run_id: UUID) -> PayrollRun:
        if scope.role not in ("hr_payroll", "system_admin", "auditor"):
            raise DomainError("forbidden", "Access denied.", 403)
        run = self.db.scalars(
            select(PayrollRun)
            .options(selectinload(PayrollRun.items))
            .where(PayrollRun.id == run_id)
        ).first()
        if not run:
            raise DomainError("not_found", "Payroll run not found.", 404)
        self._verify_org_scope(scope, run.organization_id)
        return run

    def list_payroll_runs(
        self, scope: Scope, pay_period_id: UUID | None = None
    ) -> list[PayrollRun]:
        if scope.role not in ("hr_payroll", "system_admin", "auditor"):
            raise DomainError("forbidden", "Access denied.", 403)
        query = select(PayrollRun)
        if scope.role != "system_admin":
            query = query.where(PayrollRun.organization_id == scope.organization_id)
        if pay_period_id:
            query = query.where(PayrollRun.pay_period_id == pay_period_id)
        query = query.order_by(PayrollRun.created_at.desc())
        return list(self.db.scalars(query).all())

    def preview_run(self, scope: Scope, run_id: UUID) -> PayrollRunPreviewOut:
        run = self.get_payroll_run(scope, run_id)
        items = run.items or []

        sum_gross = sum((it.gross_pay for it in items), Decimal("0.00"))
        sum_net = sum((it.net_pay for it in items), Decimal("0.00"))
        sum_minutes = sum(it.payable_minutes for it in items)

        reconciles = (
            sum_gross == run.total_gross_pay
            and sum_net == run.total_net_pay
            and sum_minutes == run.total_payable_minutes
        )

        unresolved_total = sum(it.unresolved_exceptions_count for it in items)
        blockers: list[str] = []
        if not reconciles:
            blockers.append("Totals do not reconcile with line items.")
        if unresolved_total > 0:
            blockers.append(f"{unresolved_total} unresolved attendance exception(s) present.")
        if run.status != "draft":
            blockers.append(f"Run is already {run.status}.")

        return PayrollRunPreviewOut(
            id=run.id,
            organization_id=run.organization_id,
            pay_period_id=run.pay_period_id,
            status=run.status,
            watermark=run.watermark,
            input_hash=run.input_hash,
            total_gross_pay=run.total_gross_pay,
            total_net_pay=run.total_net_pay,
            total_payable_minutes=run.total_payable_minutes,
            total_employees=run.total_employees,
            unresolved_exceptions_total=unresolved_total,
            reconciles=reconciles,
            blockers=blockers,
        )

    # 4. Day 7 - Transactional Approval Lock & Payslip Generation
    def approve_run(
        self, scope: Scope, user_id: UUID, run_id: UUID, notes: str | None = None
    ) -> PayrollRun:
        self._verify_hr_or_admin(scope)
        run = self.get_payroll_run(scope, run_id)

        if run.status != "draft":
            raise DomainError(
                "run_already_locked",
                f"Payroll run is currently '{run.status}'. Locked runs cannot be modified.",
                409,
            )

        # Validation: exceptions block approval
        items = run.items or []
        unresolved_total = sum(it.unresolved_exceptions_count for it in items)
        if unresolved_total > 0:
            raise DomainError(
                "unresolved_exceptions_block_approval",
                f"Cannot approve run: {unresolved_total} unresolved attendance exceptions present.",
                422,
            )

        # Validation: reconciliation must be 100%
        sum_gross = sum((it.gross_pay for it in items), Decimal("0.00"))
        sum_net = sum((it.net_pay for it in items), Decimal("0.00"))
        if sum_gross != run.total_gross_pay or sum_net != run.total_net_pay:
            raise DomainError("reconciliation_failed", "Totals do not reconcile.", 422)

        org = self.db.get(Organization, run.organization_id)
        period = self.db.get(PayPeriod, run.pay_period_id)
        org_name = org.name if org else "SNR NEST"
        period_name = period.name if period else "Current Period"

        now = datetime.now(UTC)
        run.status = "locked"
        run.locked_at = now
        run.locked_by = user_id

        # Generate private PDF payslips for all line items
        for it in items:
            pdf_bytes = generate_payslip_pdf(
                org_name=org_name,
                period_name=period_name,
                employee_name=it.employee_name,
                employee_code=it.employee_code,
                hours=str((Decimal(it.payable_minutes) / Decimal(60)).quantize(Decimal("0.01"))),
                hourly_rate=str(it.hourly_rate),
                gross_pay=str(it.gross_pay),
                net_pay=str(it.net_pay),
                currency=org.currency if org else "INR",
                status="Generated (Pending Release)",
                watermark=WATERMARK_TEXT,
                input_hash=run.input_hash,
            )
            object_key = f"payslips/{run.organization_id}/{run.id}/{it.employee_id}.pdf"
            payslip = Payslip(
                id=uuid4(),
                organization_id=run.organization_id,
                payroll_run_id=run.id,
                payroll_item_id=it.id,
                employee_id=it.employee_id,
                period_name=period_name,
                gross_pay=it.gross_pay,
                net_pay=it.net_pay,
                currency=org.currency if org else "INR",
                status="generated",  # Remains private until explicit release
                object_key=object_key,
                pdf_data=pdf_bytes,
                created_at=now,
            )
            self.db.add(payslip)

        # Append-only audit log
        audit = PayrollAuditLog(
            id=uuid4(),
            organization_id=run.organization_id,
            payroll_run_id=run.id,
            action="approved",
            details=notes or f"Payroll run {run.id} locked and approved by user {user_id}",
            performed_by=user_id,
            created_at=now,
        )
        self.db.add(audit)
        self.db.commit()
        self.db.refresh(run)
        return run

    # 5. Day 7 - Release Payslips
    def release_run_payslips(
        self, scope: Scope, user_id: UUID, run_id: UUID, notes: str | None = None
    ) -> list[Payslip]:
        self._verify_hr_or_admin(scope)
        run = self.get_payroll_run(scope, run_id)

        if run.status != "locked":
            msg = (
                f"Cannot release payslips: run is '{run.status}'. "
                f"Run must be approved and locked first."
            )
            raise DomainError("run_not_locked", msg, 422)

        payslips = list(
            self.db.scalars(
                select(Payslip).where(
                    Payslip.payroll_run_id == run.id,
                    Payslip.organization_id == run.organization_id,
                )
            ).all()
        )
        if not payslips:
            raise DomainError("no_payslips", "No payslips found to release for this run.", 404)

        now = datetime.now(UTC)
        for p in payslips:
            p.status = "released"
            p.released_at = now
            p.released_by = user_id

        audit = PayrollAuditLog(
            id=uuid4(),
            organization_id=run.organization_id,
            payroll_run_id=run.id,
            action="released",
            details=notes or f"Payslips released for run {run.id} by user {user_id}",
            performed_by=user_id,
            created_at=now,
        )
        self.db.add(audit)
        self.db.commit()
        return payslips

    # 6. Day 7 - Reversal flow (Corrections after Lock)
    def reverse_run(self, scope: Scope, user_id: UUID, run_id: UUID, reason: str) -> PayrollRun:
        self._verify_hr_or_admin(scope)
        run = self.get_payroll_run(scope, run_id)

        if run.status != "locked":
            raise DomainError(
                "invalid_reversal_state",
                f"Only locked runs can be reversed. Current status: '{run.status}'.",
                422,
            )

        now = datetime.now(UTC)
        run.status = "reversed"

        # Cancel associated payslips
        payslips = list(
            self.db.scalars(select(Payslip).where(Payslip.payroll_run_id == run.id)).all()
        )
        for p in payslips:
            p.status = "cancelled"

        audit = PayrollAuditLog(
            id=uuid4(),
            organization_id=run.organization_id,
            payroll_run_id=run.id,
            action="reversed",
            details=f"Run reversed: {reason}",
            performed_by=user_id,
            created_at=now,
        )
        self.db.add(audit)
        self.db.commit()
        self.db.refresh(run)
        return run

    # 7. Day 7 - Employee Payslip Access & Short-Lived Download Intents
    def list_my_payslips(self, scope: Scope, user_id: UUID) -> list[Payslip]:
        """Strictly scopes payslip listing to employee's own RELEASED payslips."""
        employee = self.db.scalars(
            select(Employee).where(
                Employee.user_id == user_id,
                Employee.organization_id == scope.organization_id,
            )
        ).first()
        if not employee:
            return []

        # Acceptance Test 3: Unreleased payslips are completely hidden
        query = (
            select(Payslip)
            .where(
                Payslip.employee_id == employee.id,
                Payslip.organization_id == scope.organization_id,
                Payslip.status == "released",
            )
            .order_by(Payslip.created_at.desc())
        )
        return list(self.db.scalars(query).all())

    def create_download_intent(
        self, scope: Scope, user_id: UUID, payslip_id: UUID
    ) -> PayslipDownloadIntentOut:
        payslip = self.db.get(Payslip, payslip_id)
        if not payslip:
            raise DomainError("not_found", "Payslip not found.", 404)
        self._verify_org_scope(scope, payslip.organization_id)

        # Role scoping check
        if scope.role == "employee":
            employee = self.db.scalars(select(Employee).where(Employee.user_id == user_id)).first()
            if not employee or payslip.employee_id != employee.id:
                # Acceptance Test 2: Employee cannot access another payslip
                raise DomainError("forbidden", "You cannot access this payslip.", 403)
            if payslip.status != "released":
                # Acceptance Test 3: Unreleased payslip hidden
                raise DomainError("not_found", "Payslip is not released.", 404)
        elif scope.role not in ("hr_payroll", "system_admin", "auditor"):
            raise DomainError("forbidden", "Access denied.", 403)

        # Generate HMAC-signed token expiring in 300 seconds
        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=300)
        timestamp_str = str(int(expires_at.timestamp()))
        nonce = secrets.token_hex(16)
        raw_payload = f"{payslip.id}:{timestamp_str}:{nonce}"
        sig = hmac.new(
            self.settings.qr_signing_secret.encode(), raw_payload.encode(), hashlib.sha256
        ).digest()
        sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
        token = f"{raw_payload}:{sig_b64}"

        safe_name = payslip.period_name.replace(" ", "_")
        filename = f"payslip_{safe_name}.pdf"
        download_url = f"/api/v1/payslips/download/{token}"

        return PayslipDownloadIntentOut(
            payslip_id=payslip.id,
            download_url=download_url,
            expires_at=expires_at,
            filename=filename,
        )

    def get_payslip_by_token(self, token: str) -> tuple[Payslip, bytes]:
        parts = token.split(":")
        if len(parts) != 4:
            raise DomainError("invalid_token", "Invalid download token.", 401)

        payslip_id_str, timestamp_str, nonce, sig_b64 = parts
        try:
            expires_at = datetime.fromtimestamp(int(timestamp_str), tz=UTC)
        except ValueError:
            raise DomainError("invalid_token", "Malformed token timestamp.", 401) from None

        # Acceptance Test 4: Signed URL expires
        if datetime.now(UTC) > expires_at:
            raise DomainError("token_expired", "Download link has expired.", 401)

        # Verify signature
        raw_payload = f"{payslip_id_str}:{timestamp_str}:{nonce}"
        expected_sig = hmac.new(
            self.settings.qr_signing_secret.encode(), raw_payload.encode(), hashlib.sha256
        ).digest()
        expected_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")
        if not hmac.compare_digest(sig_b64, expected_b64):
            raise DomainError("invalid_token", "Invalid token signature.", 401)

        try:
            payslip_id = UUID(payslip_id_str)
        except ValueError:
            raise DomainError("invalid_token", "Malformed payslip ID.", 401) from None

        payslip = self.db.get(Payslip, payslip_id)
        if not payslip or not payslip.pdf_data:
            raise DomainError("not_found", "Payslip object not found.", 404)

        return payslip, payslip.pdf_data
