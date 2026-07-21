"""allow standalone single tracks

Revision ID: 005_standalone_singles
Revises: 004_add_cover_image_keys
Create Date: 2026-07-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_standalone_singles"
down_revision: Union[str, Sequence[str], None] = "004_add_cover_image_keys"

branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("tracks", "album_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "tracks",
        sa.Column("artist_id", sa.Integer(), sa.ForeignKey("artists.id", ondelete="CASCADE"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tracks", "artist_id")
    op.alter_column("tracks", "album_id", existing_type=sa.Integer(), nullable=False)
