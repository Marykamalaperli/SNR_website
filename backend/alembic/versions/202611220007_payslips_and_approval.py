"""Create payslips and payroll audit logs tables.

Revision ID: 202611220007
Revises: 202611220006
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "202611220007"
down_revision: str | None = "202611220006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. payslips table
    op.create_table(
        "payslips",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("payroll_run_id", uuid, sa.ForeignKey("payroll_runs.id"), nullable=False),
        sa.Column("payroll_item_id", uuid, sa.ForeignKey("payroll_items.id"), nullable=False),
        sa.Column("employee_id", uuid, nullable=False),
        sa.Column("period_name", sa.String(100), nullable=False),
        sa.Column("gross_pay", sa.Numeric(12, 2), nullable=False),
        sa.Column("net_pay", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), server_default="INR", nullable=False),
        sa.Column("status", sa.String(32), server_default="generated", nullable=False),
        sa.Column("object_key", sa.String(512), nullable=False),
        sa.Column("pdf_data", sa.LargeBinary(), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_by", uuid, sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("payroll_item_id", name="uq_payslips_payroll_item"),
        sa.ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
    )
    op.create_index("ix_payslips_organization_id", "payslips", ["organization_id"])
    op.create_index("ix_payslips_payroll_run_id", "payslips", ["payroll_run_id"])
    op.create_index("ix_payslips_employee_id", "payslips", ["employee_id"])
    op.create_index("ix_payslips_status", "payslips", ["status"])

    # 2. payroll_audit_logs table
    op.create_table(
        "payroll_audit_logs",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("payroll_run_id", uuid, sa.ForeignKey("payroll_runs.id"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("details", sa.String(1024), nullable=False),
        sa.Column("performed_by", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_payroll_audit_logs_organization_id", "payroll_audit_logs", ["organization_id"]
    )
    op.create_index(
        "ix_payroll_audit_logs_payroll_run_id", "payroll_audit_logs", ["payroll_run_id"]
    )


def downgrade() -> None:
    op.drop_table("payroll_audit_logs")
    op.drop_table("payslips")
