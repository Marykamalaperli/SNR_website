"""Create attendance challenges, events, and audit logs.

Revision ID: 202611220004
Revises: 202611220003
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "202611220004"
down_revision: str | None = "202611220003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    op.create_table(
        "attendance_challenges",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("store_id", uuid, nullable=False),
        sa.Column("challenge_token", sa.String(256), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("created_by", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
    )
    op.create_index(
        "ix_attendance_challenges_organization_id", "attendance_challenges", ["organization_id"]
    )
    op.create_index("ix_attendance_challenges_store_id", "attendance_challenges", ["store_id"])
    op.create_index("ix_attendance_challenges_expires_at", "attendance_challenges", ["expires_at"])

    op.create_table(
        "attendance_events",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("store_id", uuid, nullable=False),
        sa.Column("employee_id", uuid, nullable=False),
        sa.Column("shift_id", uuid, sa.ForeignKey("shifts.id"), nullable=True),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("server_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("store_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("photo_key", sa.String(512), nullable=False),
        sa.Column("location_latitude", sa.Float, nullable=True),
        sa.Column("location_longitude", sa.Float, nullable=True),
        sa.Column("location_accuracy", sa.Float, nullable=True),
        sa.Column("device_info", sa.String(256), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("action IN ('clock_in', 'clock_out')", name="ck_attendance_action"),
        sa.UniqueConstraint(
            "organization_id",
            "employee_id",
            "idempotency_key",
            name="uq_attendance_events_idempotency",
        ),
        sa.ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
        sa.ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
    )
    op.create_index(
        "ix_attendance_events_organization_id", "attendance_events", ["organization_id"]
    )
    op.create_index("ix_attendance_events_store_id", "attendance_events", ["store_id"])
    op.create_index("ix_attendance_events_employee_id", "attendance_events", ["employee_id"])
    op.create_index(
        "ix_attendance_events_server_timestamp", "attendance_events", ["server_timestamp"]
    )
    op.create_index(
        "ix_attendance_events_employee_time",
        "attendance_events",
        ["employee_id", "server_timestamp"],
    )

    op.create_table(
        "attendance_audit_logs",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("event_id", uuid, sa.ForeignKey("attendance_events.id"), nullable=True),
        sa.Column("employee_id", uuid, sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("details", sa.String(1024), nullable=False),
        sa.Column("performed_by", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_attendance_audit_logs_organization_id", "attendance_audit_logs", ["organization_id"]
    )
    op.create_index("ix_attendance_audit_logs_event_id", "attendance_audit_logs", ["event_id"])
    op.create_index(
        "ix_attendance_audit_logs_employee_id", "attendance_audit_logs", ["employee_id"]
    )


def downgrade() -> None:
    op.drop_table("attendance_audit_logs")
    op.drop_table("attendance_events")
    op.drop_table("attendance_challenges")
