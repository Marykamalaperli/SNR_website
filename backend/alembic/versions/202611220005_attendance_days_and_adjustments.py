"""Create attendance days and adjustments tables.

Revision ID: 202611220005
Revises: 202611220004
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "202611220005"
down_revision: str | None = "202611220004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    op.create_table(
        "attendance_days",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("store_id", uuid, nullable=False),
        sa.Column("employee_id", uuid, nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("shift_id", uuid, sa.ForeignKey("shifts.id"), nullable=True),
        sa.Column("first_in", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payable_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(32), server_default="missing_punch", nullable=False),
        sa.Column("is_missing_punch", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_late", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_early_departure", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_overtime", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("late_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("early_departure_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("overtime_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("employee_id", "work_date", name="uq_attendance_days_employee_date"),
        sa.ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
        sa.ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
    )
    op.create_index("ix_attendance_days_organization_id", "attendance_days", ["organization_id"])
    op.create_index("ix_attendance_days_store_id", "attendance_days", ["store_id"])
    op.create_index("ix_attendance_days_employee_id", "attendance_days", ["employee_id"])
    op.create_index("ix_attendance_days_work_date", "attendance_days", ["work_date"])
    op.create_index("ix_attendance_days_status", "attendance_days", ["status"])
    op.create_index("ix_attendance_days_store_date", "attendance_days", ["store_id", "work_date"])

    op.create_table(
        "attendance_adjustments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("attendance_day_id", uuid, sa.ForeignKey("attendance_days.id"), nullable=False),
        sa.Column("before_json", sa.JSON(), nullable=False),
        sa.Column("after_json", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(512), nullable=False),
        sa.Column("status", sa.String(32), server_default="pending_approval", nullable=False),
        sa.Column("requested_by", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approved_by", uuid, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("review_note", sa.String(512), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_attendance_adjustments_organization_id", "attendance_adjustments", ["organization_id"]
    )
    op.create_index(
        "ix_attendance_adjustments_attendance_day_id",
        "attendance_adjustments",
        ["attendance_day_id"],
    )
    op.create_index("ix_attendance_adjustments_status", "attendance_adjustments", ["status"])


def downgrade() -> None:
    op.drop_table("attendance_adjustments")
    op.drop_table("attendance_days")
