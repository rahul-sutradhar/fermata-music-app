"""add playlist cover image key

Revision ID: 006_playlist_cover
Revises: 005_standalone_singles
Create Date: 2026-07-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_playlist_cover"
down_revision: Union[str, Sequence[str], None] = "005_standalone_singles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "playlists",
        sa.Column("cover_image_key", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("playlists", "cover_image_key")
