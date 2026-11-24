"""Add location coordinates and map_url to stores.

Revision ID: 202611220008
Revises: 202611220007
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "202611220008"
down_revision: str | None = "202611220007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("stores", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("stores", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("stores", sa.Column("map_url", sa.String(length=4096), nullable=True))
    op.add_column(
        "stores", sa.Column("radius_meters", sa.Integer(), nullable=True, server_default="50")
    )


def downgrade() -> None:
    op.drop_column("stores", "radius_meters")
    op.drop_column("stores", "map_url")
    op.drop_column("stores", "longitude")
    op.drop_column("stores", "latitude")
