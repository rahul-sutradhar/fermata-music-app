"""add audio file key to track

Revision ID: 002
Revises: 001
Create Date: 2026-07-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, Sequence[str], None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tracks",
        sa.Column("audio_file_key", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tracks", "audio_file_key")
