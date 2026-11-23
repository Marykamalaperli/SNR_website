import base64
import hashlib
import hmac
import secrets
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import DomainError
from app.models.attendance import (
    AttendanceAdjustment,
    AttendanceAuditLog,
    AttendanceChallenge,
    AttendanceDay,
    AttendanceEvent,
)
from app.models.identity import Employee, Store
from app.models.workforce import Shift, ShiftAssignment
from app.schemas.attendance import (
    AttendanceAdjustmentCreate,
    AttendanceAdjustmentOut,
    AttendanceAdjustmentReview,
    AttendanceDayOut,
    AttendanceEventRequest,
    PhotoUploadIntentOut,
    StoreQRChallengeOut,
)
from app.schemas.auth import CurrentUser, Scope


class AttendanceService:
    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = settings

    def issue_qr_challenge(
        self, store_id: UUID, current_user: CurrentUser, scope: Scope
    ) -> StoreQRChallengeOut:
        store = self.db.get(Store, store_id)
        if not store:
            raise DomainError("not_found", "Store not found.", 404)
        if scope.role != "system_admin":
            if store.organization_id != scope.organization_id:
                raise DomainError("forbidden", "Store outside your authorized organization.", 403)
            if scope.store_id is not None and scope.store_id != store_id:
                raise DomainError("forbidden", "Store outside your authorized store.", 403)

        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=self.settings.qr_challenge_lifetime_seconds)
        timestamp_str = str(int(expires_at.timestamp()))
        nonce = secrets.token_hex(16)
        payload = f"{store.id}:{timestamp_str}:{nonce}"
        sig = hmac.new(
            self.settings.qr_signing_secret.encode(), payload.encode(), hashlib.sha256
        ).digest()
        sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
        token = f"{payload}:{sig_b64}"

        challenge = AttendanceChallenge(
            organization_id=store.organization_id,
            store_id=store.id,
            challenge_token=token,
            expires_at=expires_at,
            created_at=now,
            created_by=current_user.user_id,
        )
        self.db.add(challenge)
        self.db.commit()

        return StoreQRChallengeOut(
            challenge_token=token,
            store_id=store.id,
            expires_at=expires_at,
        )

    def verify_challenge(self, token: str) -> AttendanceChallenge:
        parts = token.split(":")
        if len(parts) != 4:
            raise DomainError("invalid_challenge", "QR challenge format is invalid.", 400)

        store_id_str, timestamp_str, nonce, sig_b64 = parts
        payload = f"{store_id_str}:{timestamp_str}:{nonce}"
        expected_sig = hmac.new(
            self.settings.qr_signing_secret.encode(), payload.encode(), hashlib.sha256
        ).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")

        if not hmac.compare_digest(sig_b64, expected_sig_b64):
            raise DomainError(
                "invalid_challenge_signature", "QR challenge signature is invalid.", 403
            )

        now = datetime.now(UTC)
        try:
            expires_ts = int(timestamp_str)
            if datetime.fromtimestamp(expires_ts, UTC) < now:
                raise DomainError("expired_challenge", "QR challenge has expired.", 410)
        except ValueError:
            raise DomainError(
                "invalid_challenge", "QR challenge timestamp is invalid.", 400
            ) from None

        challenge = self.db.scalar(
            select(AttendanceChallenge).where(AttendanceChallenge.challenge_token == token)
        )
        if not challenge:
            raise DomainError("challenge_not_found", "QR challenge not found.", 404)
        if challenge.used_at is not None:
            raise DomainError("challenge_already_used", "QR challenge has already been used.", 409)

        return challenge

    def create_photo_upload_intent(
        self, store_id: UUID, current_user: CurrentUser, scope: Scope
    ) -> PhotoUploadIntentOut:
        store = self.db.get(Store, store_id)
        if not store:
            raise DomainError("not_found", "Store not found.", 404)
        if scope.role != "system_admin" and store.organization_id != scope.organization_id:
            raise DomainError("forbidden", "Store outside your authorized scope.", 403)

        today_str = datetime.now(UTC).strftime("%Y-%m-%d")
        photo_uuid = uuid4()
        photo_key = f"evidence/{store.organization_id}/{store.id}/{today_str}/{photo_uuid}.jpg"

        upload_url = f"/api/v1/attendance/evidence/{photo_key}"
        return PhotoUploadIntentOut(
            upload_url=upload_url,
            photo_key=photo_key,
            expires_in=300,
            max_bytes=5242880,  # 5 MB
        )

    def record_event(
        self,
        payload: AttendanceEventRequest,
        idempotency_key: str,
        current_user: CurrentUser,
        scope: Scope,
    ) -> AttendanceEvent:
        now = datetime.now(UTC)

        employee = self.db.scalar(select(Employee).where(Employee.user_id == current_user.user_id))
        if not employee or employee.status != "active":
            raise DomainError("employee_not_found", "Active employee record required.", 403)

        existing = self.db.scalar(
            select(AttendanceEvent).where(
                AttendanceEvent.organization_id == employee.organization_id,
                AttendanceEvent.employee_id == employee.id,
                AttendanceEvent.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return existing

        challenge = self.verify_challenge(payload.challenge_token)
        store = self.db.get(Store, challenge.store_id)
        if not store:
            raise DomainError("not_found", "Store not found.", 404)

        last_event = self.db.scalar(
            select(AttendanceEvent)
            .where(
                AttendanceEvent.employee_id == employee.id,
                AttendanceEvent.organization_id == employee.organization_id,
            )
            .order_by(AttendanceEvent.server_timestamp.desc())
            .limit(1)
        )

        if payload.action == "clock_in":
            if last_event and last_event.action == "clock_in":
                raise DomainError(
                    "already_clocked_in",
                    "You are already clocked in. Clock out before clocking in again.",
                    409,
                )
        elif payload.action == "clock_out":
            if not last_event or last_event.action != "clock_in":
                raise DomainError(
                    "not_clocked_in",
                    "You are not clocked in. You must clock in first.",
                    409,
                )

        try:
            store_tz = ZoneInfo(store.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            store_tz = ZoneInfo("UTC")
        store_timestamp = now.astimezone(store_tz)

        today = store_timestamp.date()
        shift_assignment = self.db.scalar(
            select(ShiftAssignment)
            .where(
                ShiftAssignment.employee_id == employee.id,
                ShiftAssignment.effective_from <= today,
                ShiftAssignment.effective_until >= today,
            )
            .order_by(ShiftAssignment.effective_from.desc())
            .limit(1)
        )
        shift_id = shift_assignment.shift_id if shift_assignment else None

        event = AttendanceEvent(
            organization_id=employee.organization_id,
            store_id=store.id,
            employee_id=employee.id,
            shift_id=shift_id,
            action=payload.action,
            idempotency_key=idempotency_key,
            server_timestamp=now,
            store_timestamp=store_timestamp,
            photo_key=payload.photo_key,
            location_latitude=payload.location_latitude,
            location_longitude=payload.location_longitude,
            location_accuracy=payload.location_accuracy,
            device_info=payload.device_info,
            created_at=now,
        )
        self.db.add(event)
        challenge.used_at = now

        details = f"{payload.action} at {store.code} (idempotency: {idempotency_key})"
        audit = AttendanceAuditLog(
            organization_id=employee.organization_id,
            event_id=event.id,
            employee_id=employee.id,
            action="recorded",
            details=details,
            performed_by=current_user.user_id,
            created_at=now,
        )
        self.db.add(audit)

        # Synchronize derived daily attendance summary
        self._sync_daily_summary(employee, store, event, today, shift_id, store_tz, now)

        self.db.commit()
        self.db.refresh(event)

        return event

    def _sync_daily_summary(
        self,
        employee: Employee,
        store: Store,
        new_event: AttendanceEvent,
        work_date: date,
        shift_id: UUID | None,
        store_tz: ZoneInfo,
        now: datetime,
    ) -> AttendanceDay:
        day = self.db.scalar(
            select(AttendanceDay).where(
                AttendanceDay.employee_id == employee.id,
                AttendanceDay.work_date == work_date,
            )
        )
        if not day:
            day = AttendanceDay(
                id=uuid4(),
                organization_id=employee.organization_id,
                store_id=store.id,
                employee_id=employee.id,
                work_date=work_date,
                shift_id=shift_id,
                status="missing_punch",
                is_missing_punch=True,
                version=1,
                created_at=now,
                updated_at=now,
            )
            self.db.add(day)

        # Query all events for this employee within store's work_date
        day_start_local = datetime.combine(work_date, time.min, tzinfo=store_tz)
        day_end_local = datetime.combine(work_date, time.max, tzinfo=store_tz)
        day_start_utc = day_start_local.astimezone(UTC)
        day_end_utc = day_end_local.astimezone(UTC)

        events = list(
            self.db.scalars(
                select(AttendanceEvent)
                .where(
                    AttendanceEvent.employee_id == employee.id,
                    AttendanceEvent.organization_id == employee.organization_id,
                    AttendanceEvent.server_timestamp >= day_start_utc,
                    AttendanceEvent.server_timestamp <= day_end_utc,
                )
                .order_by(AttendanceEvent.server_timestamp.asc())
            )
        )
        if new_event not in events:
            events.append(new_event)
            events.sort(key=lambda e: e.server_timestamp)

        in_events = [e for e in events if e.action == "clock_in"]
        out_events = [e for e in events if e.action == "clock_out"]

        first_in = in_events[0].server_timestamp if in_events else None
        last_out = out_events[-1].server_timestamp if out_events else None

        day.first_in = first_in
        day.last_out = last_out
        day.updated_at = now

        # Calculate payable minutes & basic status
        if first_in and last_out and last_out >= first_in:
            day.payable_minutes = max(0, int((last_out - first_in).total_seconds() // 60))
            day.is_missing_punch = False
            day.status = "present"
        else:
            day.payable_minutes = 0
            day.is_missing_punch = True
            day.status = "missing_punch"

        # Evaluate exceptions against assigned shift
        day.is_late = False
        day.late_minutes = 0
        day.is_early_departure = False
        day.early_departure_minutes = 0
        day.is_overtime = False
        day.overtime_minutes = 0

        shift = self.db.get(Shift, shift_id) if shift_id else None
        if shift and first_in:
            first_in_local = first_in.astimezone(store_tz)
            scheduled_start = datetime.combine(work_date, shift.start_time, tzinfo=store_tz)
            if first_in_local > scheduled_start:
                diff_sec = (first_in_local - scheduled_start).total_seconds()
                day.late_minutes = int(diff_sec // 60)
                day.is_late = day.late_minutes > 0

        if shift and last_out:
            last_out_local = last_out.astimezone(store_tz)
            end_date = work_date + timedelta(days=1) if shift.is_overnight else work_date
            scheduled_end = datetime.combine(end_date, shift.end_time, tzinfo=store_tz)
            if last_out_local < scheduled_end:
                diff_sec = (scheduled_end - last_out_local).total_seconds()
                day.early_departure_minutes = int(diff_sec // 60)
                day.is_early_departure = day.early_departure_minutes > 0
            elif last_out_local > scheduled_end:
                diff_sec = (last_out_local - scheduled_end).total_seconds()
                day.overtime_minutes = int(diff_sec // 60)
                day.is_overtime = day.overtime_minutes > 0

        return day

    def list_events(
        self,
        scope: Scope,
        employee_id: UUID | None = None,
        store_id: UUID | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[AttendanceEvent], int]:
        query = select(AttendanceEvent)
        if scope.role == "system_admin":
            pass
        elif scope.store_id is not None:
            query = query.where(
                AttendanceEvent.organization_id == scope.organization_id,
                AttendanceEvent.store_id == scope.store_id,
            )
        else:
            query = query.where(AttendanceEvent.organization_id == scope.organization_id)

        if employee_id is not None:
            query = query.where(AttendanceEvent.employee_id == employee_id)
        if store_id is not None:
            query = query.where(AttendanceEvent.store_id == store_id)
        if start_date is not None:
            query = query.where(AttendanceEvent.server_timestamp >= start_date)
        if end_date is not None:
            query = query.where(AttendanceEvent.server_timestamp <= end_date)

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        events = list(
            self.db.scalars(
                query.order_by(AttendanceEvent.server_timestamp.desc()).offset(offset).limit(limit)
            )
        )
        return events, total or 0

    def list_days(
        self,
        scope: Scope,
        store_id: UUID | None = None,
        employee_id: UUID | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        status: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[AttendanceDayOut], int]:
        query = (
            select(
                AttendanceDay,
                Employee.display_name.label("employee_name"),
                Employee.employee_code.label("employee_code"),
                Store.name.label("store_name"),
            )
            .join(Employee, AttendanceDay.employee_id == Employee.id)
            .join(Store, AttendanceDay.store_id == Store.id)
        )

        if scope.role == "system_admin":
            pass
        elif scope.store_id is not None:
            query = query.where(
                AttendanceDay.organization_id == scope.organization_id,
                AttendanceDay.store_id == scope.store_id,
            )
        else:
            query = query.where(AttendanceDay.organization_id == scope.organization_id)

        if store_id is not None:
            if scope.store_id is not None and scope.store_id != store_id:
                raise DomainError("forbidden", "Store outside your authorized store.", 403)
            query = query.where(AttendanceDay.store_id == store_id)

        if employee_id is not None:
            query = query.where(AttendanceDay.employee_id == employee_id)

        if from_date is not None:
            query = query.where(AttendanceDay.work_date >= from_date)
        if to_date is not None:
            query = query.where(AttendanceDay.work_date <= to_date)
        if status is not None:
            query = query.where(AttendanceDay.status == status)

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        rows = self.db.execute(
            query.order_by(AttendanceDay.work_date.desc(), AttendanceDay.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()

        results = []
        for day, emp_name, emp_code, store_name in rows:
            out = AttendanceDayOut.model_validate(day)
            out.employee_name = emp_name
            out.employee_code = emp_code
            out.store_name = store_name
            results.append(out)

        return results, total or 0

    def get_day(self, day_id: UUID, scope: Scope) -> AttendanceDayOut:
        query = (
            select(
                AttendanceDay,
                Employee.display_name.label("employee_name"),
                Employee.employee_code.label("employee_code"),
                Store.name.label("store_name"),
            )
            .join(Employee, AttendanceDay.employee_id == Employee.id)
            .join(Store, AttendanceDay.store_id == Store.id)
            .where(AttendanceDay.id == day_id)
        )
        row = self.db.execute(query).first()
        if not row:
            raise DomainError("not_found", "Attendance day not found.", 404)

        day, emp_name, emp_code, store_name = row
        if scope.role != "system_admin":
            if day.organization_id != scope.organization_id:
                raise DomainError("forbidden", "Record outside your organization.", 403)
            if scope.store_id is not None and scope.store_id != day.store_id:
                raise DomainError("forbidden", "Record outside your assigned store.", 403)

        out = AttendanceDayOut.model_validate(day)
        out.employee_name = emp_name
        out.employee_code = emp_code
        out.store_name = store_name
        return out

    def request_adjustment(
        self,
        day_id: UUID,
        payload: AttendanceAdjustmentCreate,
        current_user: CurrentUser,
        scope: Scope,
    ) -> AttendanceAdjustmentOut:
        day = self.db.get(AttendanceDay, day_id)
        if not day:
            raise DomainError("not_found", "Attendance day not found.", 404)

        # Scoped authorization check
        if scope.role != "system_admin":
            if day.organization_id != scope.organization_id:
                raise DomainError("forbidden", "Record outside your organization.", 403)
            if scope.store_id is not None and scope.store_id != day.store_id:
                raise DomainError("forbidden", "Record outside your assigned store.", 403)

        # Optimistic concurrency check
        if day.version != payload.expected_version:
            raise DomainError(
                "conflict",
                "Attendance day has been modified by another transaction. Please reload.",
                409,
            )

        now = datetime.now(UTC)

        before_json = {
            "first_in": day.first_in.isoformat() if day.first_in else None,
            "last_out": day.last_out.isoformat() if day.last_out else None,
            "payable_minutes": day.payable_minutes,
            "status": day.status,
            "version": day.version,
        }

        calc_minutes = 0
        if payload.first_in and payload.last_out and payload.last_out >= payload.first_in:
            calc_minutes = max(0, int((payload.last_out - payload.first_in).total_seconds() // 60))

        after_json = {
            "first_in": payload.first_in.isoformat() if payload.first_in else None,
            "last_out": payload.last_out.isoformat() if payload.last_out else None,
            "payable_minutes": calc_minutes,
            "status": "adjusted",
        }

        # If user has HR/Payroll or System Admin authority, can auto-approve
        is_direct_approver = scope.role in {"hr_payroll", "system_admin"}
        status = "approved" if is_direct_approver else "pending_approval"
        approved_by = current_user.user_id if is_direct_approver else None
        reviewed_at = now if is_direct_approver else None

        adjustment = AttendanceAdjustment(
            id=uuid4(),
            organization_id=day.organization_id,
            attendance_day_id=day.id,
            before_json=before_json,
            after_json=after_json,
            reason=payload.reason,
            status=status,
            requested_by=current_user.user_id,
            approved_by=approved_by,
            review_note="Direct administrative adjustment" if is_direct_approver else None,
            created_at=now,
            reviewed_at=reviewed_at,
        )
        self.db.add(adjustment)

        if is_direct_approver:
            day.first_in = payload.first_in
            day.last_out = payload.last_out
            day.payable_minutes = calc_minutes
            day.is_missing_punch = payload.first_in is None or payload.last_out is None
            day.status = "adjusted"
            day.version += 1
            day.updated_at = now

            audit = AttendanceAuditLog(
                organization_id=day.organization_id,
                event_id=None,
                employee_id=day.employee_id,
                action="adjusted",
                details=f"Adjustment approved by admin: {payload.reason}",
                performed_by=current_user.user_id,
                created_at=now,
            )
            self.db.add(audit)

        self.db.commit()
        self.db.refresh(adjustment)

        return AttendanceAdjustmentOut.model_validate(adjustment)

    def review_adjustment(
        self,
        adjustment_id: UUID,
        payload: AttendanceAdjustmentReview,
        current_user: CurrentUser,
        scope: Scope,
    ) -> AttendanceAdjustmentOut:
        # Only HR/Payroll and System Admin can review and approve
        if scope.role not in {"hr_payroll", "system_admin"}:
            raise DomainError("forbidden", "Only HR or System Admin can review adjustments.", 403)

        adjustment = self.db.get(AttendanceAdjustment, adjustment_id)
        if not adjustment:
            raise DomainError("not_found", "Attendance adjustment not found.", 404)

        if scope.role != "system_admin" and adjustment.organization_id != scope.organization_id:
            raise DomainError("forbidden", "Adjustment outside your organization.", 403)

        if adjustment.status != "pending_approval":
            raise DomainError(
                "conflict",
                f"Adjustment has already been reviewed (status: {adjustment.status}).",
                409,
            )

        now = datetime.now(UTC)
        day = self.db.get(AttendanceDay, adjustment.attendance_day_id)
        if not day:
            raise DomainError("not_found", "Associated attendance day not found.", 404)

        if payload.action == "approve":
            adjustment.status = "approved"
            adjustment.approved_by = current_user.user_id
            adjustment.reviewed_at = now
            adjustment.review_note = payload.review_note

            after = adjustment.after_json
            first_in = datetime.fromisoformat(after["first_in"]) if after.get("first_in") else None
            last_out = datetime.fromisoformat(after["last_out"]) if after.get("last_out") else None

            day.first_in = first_in
            day.last_out = last_out
            day.payable_minutes = after.get("payable_minutes", 0)
            day.is_missing_punch = first_in is None or last_out is None
            day.status = "adjusted"
            day.version += 1
            day.updated_at = now

            audit = AttendanceAuditLog(
                organization_id=day.organization_id,
                event_id=None,
                employee_id=day.employee_id,
                action="adjustment_approved",
                details=f"Adjustment approved: {payload.review_note or 'No notes'}",
                performed_by=current_user.user_id,
                created_at=now,
            )
            self.db.add(audit)
        else:
            adjustment.status = "rejected"
            adjustment.approved_by = current_user.user_id
            adjustment.reviewed_at = now
            adjustment.review_note = payload.review_note

            audit = AttendanceAuditLog(
                organization_id=day.organization_id,
                event_id=None,
                employee_id=day.employee_id,
                action="adjustment_rejected",
                details=f"Adjustment rejected: {payload.review_note or 'No notes'}",
                performed_by=current_user.user_id,
                created_at=now,
            )
            self.db.add(audit)

        self.db.commit()
        self.db.refresh(adjustment)
        return AttendanceAdjustmentOut.model_validate(adjustment)

    def list_adjustments(
        self,
        scope: Scope,
        attendance_day_id: UUID | None = None,
        status: str | None = None,
    ) -> list[AttendanceAdjustmentOut]:
        query = select(AttendanceAdjustment)
        if scope.role == "system_admin":
            pass
        else:
            query = query.where(AttendanceAdjustment.organization_id == scope.organization_id)

        if attendance_day_id is not None:
            query = query.where(AttendanceAdjustment.attendance_day_id == attendance_day_id)
        if status is not None:
            query = query.where(AttendanceAdjustment.status == status)

        adjustments = list(self.db.scalars(query.order_by(AttendanceAdjustment.created_at.desc())))
        return [AttendanceAdjustmentOut.model_validate(a) for a in adjustments]
