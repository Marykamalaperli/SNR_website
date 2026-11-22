"""Create the target migration baseline without business tables.

Revision ID: 202611220001
Revises:
Create Date: 2026-11-22
"""

from collections.abc import Sequence

revision: str = "202611220001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Alembic creates its version table as the foundation marker."""


def downgrade() -> None:
    """No application tables exist in the foundation revision."""
