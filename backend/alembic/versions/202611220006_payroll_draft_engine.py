"""Create payroll draft engine tables.

Revision ID: 202611220006
Revises: 202611220005
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "202611220006"
down_revision: str | None = "202611220005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. pay_periods
    op.create_table(
        "pay_periods",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("cutoff_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(32), server_default="open", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "organization_id", "start_date", "end_date", name="uq_pay_periods_org_dates"
        ),
        sa.CheckConstraint("start_date <= end_date", name="ck_pay_periods_dates"),
    )
    op.create_index("ix_pay_periods_organization_id", "pay_periods", ["organization_id"])
    op.create_index("ix_pay_periods_status", "pay_periods", ["status"])

    # 2. payroll_configurations (effective-dated rates per employee)
    op.create_table(
        "payroll_configurations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("employee_id", uuid, nullable=False),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("daily_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_until", sa.Date(), nullable=True),
        sa.Column("created_by", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
        sa.UniqueConstraint(
            "organization_id",
            "employee_id",
            "effective_from",
            name="uq_payroll_config_emp_effective",
        ),
    )
    op.create_index(
        "ix_payroll_configurations_org_id", "payroll_configurations", ["organization_id"]
    )
    op.create_index("ix_payroll_configurations_emp_id", "payroll_configurations", ["employee_id"])

    # 3. payroll_runs
    op.create_table(
        "payroll_runs",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("store_id", uuid, sa.ForeignKey("stores.id"), nullable=True),
        sa.Column("pay_period_id", uuid, sa.ForeignKey("pay_periods.id"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False),
        sa.Column(
            "watermark", sa.String(64), server_default="Draft - Not for payment", nullable=False
        ),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("input_snapshot_json", sa.JSON(), nullable=False),
        sa.Column("total_gross_pay", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("total_net_pay", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("total_payable_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_employees", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("locked_by", uuid, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_payroll_runs_organization_id", "payroll_runs", ["organization_id"])
    op.create_index("ix_payroll_runs_store_id", "payroll_runs", ["store_id"])
    op.create_index("ix_payroll_runs_pay_period_id", "payroll_runs", ["pay_period_id"])
    op.create_index("ix_payroll_runs_status", "payroll_runs", ["status"])

    # 4. payroll_items
    op.create_table(
        "payroll_items",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("payroll_run_id", uuid, sa.ForeignKey("payroll_runs.id"), nullable=False),
        sa.Column("employee_id", uuid, nullable=False),
        sa.Column("employee_code", sa.String(64), nullable=False),
        sa.Column("employee_name", sa.String(160), nullable=False),
        sa.Column("payable_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("gross_pay", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("net_pay", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("earnings_json", sa.JSON(), nullable=False),
        sa.Column("deductions_json", sa.JSON(), nullable=False),
        sa.Column("unresolved_exceptions_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "watermark", sa.String(64), server_default="Draft - Not for payment", nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["employee_id", "organization_id"], ["employees.id", "employees.organization_id"]
        ),
        sa.UniqueConstraint("payroll_run_id", "employee_id", name="uq_payroll_items_run_employee"),
    )
    op.create_index("ix_payroll_items_organization_id", "payroll_items", ["organization_id"])
    op.create_index("ix_payroll_items_payroll_run_id", "payroll_items", ["payroll_run_id"])
    op.create_index("ix_payroll_items_employee_id", "payroll_items", ["employee_id"])


def downgrade() -> None:
    op.drop_table("payroll_items")
    op.drop_table("payroll_runs")
    op.drop_table("payroll_configurations")
    op.drop_table("pay_periods")
