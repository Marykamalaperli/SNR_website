import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import DomainError
from app.models.attendance import AttendanceAuditLog, AttendanceChallenge, AttendanceEvent
from app.models.identity import Employee, Store
from app.models.workforce import ShiftAssignment
from app.schemas.attendance import (
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

        # Production uses presigned S3 PUT; in development/test returns a valid intent endpoint
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

        # 1. Resolve employee associated with user
        employee = self.db.scalar(select(Employee).where(Employee.user_id == current_user.user_id))
        if not employee or employee.status != "active":
            raise DomainError("employee_not_found", "Active employee record required.", 403)

        # 2. Check idempotency: if already processed for this employee, return existing
        existing = self.db.scalar(
            select(AttendanceEvent).where(
                AttendanceEvent.organization_id == employee.organization_id,
                AttendanceEvent.employee_id == employee.id,
                AttendanceEvent.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return existing

        # 3. Verify and consume store QR challenge
        challenge = self.verify_challenge(payload.challenge_token)
        store = self.db.get(Store, challenge.store_id)
        if not store:
            raise DomainError("not_found", "Store not found.", 404)

        # 4. In/Out state validation
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

        # 5. Resolve store local timestamp
        try:
            store_tz = ZoneInfo(store.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            store_tz = ZoneInfo("UTC")
        store_timestamp = now.astimezone(store_tz)

        # 6. Resolve active shift assignment for today (if any)
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

        # 7. Record event & mark challenge used
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

        # 8. Append-only audit record
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
        self.db.commit()
        self.db.refresh(event)

        return event

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
