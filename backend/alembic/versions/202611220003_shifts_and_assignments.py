"""Create shifts and shift assignments tables.

Revision ID: 202611220003
Revises: 202611220002
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "202611220003"
down_revision: str | None = "202611220002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # Add composite unique constraint to employees so shift_assignments can enforce composite FK
    op.create_unique_constraint(
        "uq_employees_id_organization_id", "employees", ["id", "organization_id"]
    )

    op.create_table(
        "shifts",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("store_id", uuid, nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("break_minutes", sa.Integer, server_default="0", nullable=False),
        sa.Column("is_overnight", sa.Boolean, server_default=sa.false(), nullable=False),
        sa.Column("active", sa.Boolean, server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("store_id", "code"),
        sa.UniqueConstraint("id", "organization_id"),
        sa.ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
    )
    op.create_index("ix_shifts_organization_id", "shifts", ["organization_id"])
    op.create_index("ix_shifts_store_id", "shifts", ["store_id"])

    op.create_table(
        "shift_assignments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("employee_id", uuid, nullable=False),
        sa.Column("shift_id", uuid, nullable=False),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("effective_until", sa.Date, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("created_by", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.CheckConstraint("effective_from <= effective_until", name="ck_shift_assignment_dates"),
        sa.ForeignKeyConstraint(
            ["employee_id", "organization_id"],
            ["employees.id", "employees.organization_id"],
        ),
        sa.ForeignKeyConstraint(
            ["shift_id", "organization_id"],
            ["shifts.id", "shifts.organization_id"],
        ),
    )
    op.create_index(
        "ix_shift_assignments_organization_id", "shift_assignments", ["organization_id"]
    )
    op.create_index("ix_shift_assignments_employee_id", "shift_assignments", ["employee_id"])
    op.create_index("ix_shift_assignments_shift_id", "shift_assignments", ["shift_id"])
    op.create_index(
        "ix_shift_assignments_employee_dates",
        "shift_assignments",
        ["employee_id", "effective_from", "effective_until"],
    )


def downgrade() -> None:
    op.drop_table("shift_assignments")
    op.drop_table("shifts")
    op.drop_constraint("uq_employees_id_organization_id", "employees", type_="unique")
