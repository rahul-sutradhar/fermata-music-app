"""add cover image keys to albums and tracks

Revision ID: 004_add_cover_image_keys
Revises: e3c23a7e5812
Create Date: 2026-07-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_add_cover_image_keys"
down_revision: Union[str, Sequence[str], None] = "e3c23a7e5812"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "albums",
        sa.Column("cover_image_key", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "tracks",
        sa.Column("cover_image_key", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tracks", "cover_image_key")
    op.drop_column("albums", "cover_image_key")
