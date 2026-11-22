"""Create first-party identity and tenancy tables.

Revision ID: 202611220002
Revises: 202611220001
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "202611220002"
down_revision: str | None = "202611220001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        )
    ]


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "organizations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("default_timezone", sa.String(64), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("active", sa.Boolean, server_default=sa.true(), nullable=False),
        *timestamps(),
    )
    op.create_table(
        "stores",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean, server_default=sa.true(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("organization_id", "code"),
        sa.UniqueConstraint("id", "organization_id"),
    )
    op.create_index("ix_stores_organization_id", "stores", ["organization_id"])
    op.create_table(
        "users",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("token_version", sa.Integer, server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("email = lower(email)", name="ck_users_email_normalized"),
        sa.CheckConstraint("status IN ('active', 'deactivated')", name="ck_users_status"),
    )
    op.create_table(
        "role_assignments",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("user_id", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("store_id", uuid, nullable=True),
        sa.Column("active", sa.Boolean, server_default=sa.true(), nullable=False),
        *timestamps(),
        sa.CheckConstraint(
            "role IN ('employee', 'store_admin', 'hr_payroll', 'system_admin', 'auditor')",
            name="ck_role_assignments_role",
        ),
        sa.CheckConstraint(
            "(role = 'system_admin' AND organization_id IS NULL AND store_id IS NULL) OR "
            "(role IN ('hr_payroll', 'auditor') AND organization_id IS NOT NULL "
            "AND store_id IS NULL) OR "
            "(role IN ('employee', 'store_admin') AND organization_id IS NOT NULL "
            "AND store_id IS NOT NULL)",
            name="ck_role_assignments_scope",
        ),
        sa.UniqueConstraint("user_id", "role", "organization_id", "store_id"),
        sa.ForeignKeyConstraint(
            ["store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
    )
    for column in ("user_id", "organization_id", "store_id"):
        op.create_index(f"ix_role_assignments_{column}", "role_assignments", [column])
    op.create_index(
        "uq_role_assignments_global",
        "role_assignments",
        ["user_id", "role"],
        unique=True,
        postgresql_where=sa.text("role = 'system_admin'"),
    )
    op.create_index(
        "uq_role_assignments_organization",
        "role_assignments",
        ["user_id", "role", "organization_id"],
        unique=True,
        postgresql_where=sa.text("store_id IS NULL AND organization_id IS NOT NULL"),
    )
    op.create_table(
        "employees",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("home_store_id", uuid, nullable=False),
        sa.Column("user_id", uuid, sa.ForeignKey("users.id"), nullable=True, unique=True),
        sa.Column("employee_code", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("hire_date", sa.Date, nullable=False),
        sa.Column("exit_date", sa.Date, nullable=True),
        *timestamps(),
        sa.UniqueConstraint("organization_id", "employee_code"),
        sa.CheckConstraint("status IN ('active', 'deactivated')", name="ck_employees_status"),
        sa.ForeignKeyConstraint(
            ["home_store_id", "organization_id"], ["stores.id", "stores.organization_id"]
        ),
    )
    op.create_index("ix_employees_organization_id", "employees", ["organization_id"])
    op.create_index("ix_employees_home_store_id", "employees", ["home_store_id"])
    op.create_table(
        "auth_sessions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("user_id", uuid, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("access_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("token_version", sa.Integer, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_access_expires_at", "auth_sessions", ["access_expires_at"])
    op.create_index("ix_auth_sessions_refresh_expires_at", "auth_sessions", ["refresh_expires_at"])


def downgrade() -> None:
    op.drop_table("auth_sessions")
    op.drop_table("employees")
    op.drop_table("role_assignments")
    op.drop_table("users")
    op.drop_table("stores")
    op.drop_table("organizations")
