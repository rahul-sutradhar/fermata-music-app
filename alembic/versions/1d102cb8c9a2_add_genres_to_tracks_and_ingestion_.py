"""add_genres_to_tracks_and_ingestion_requests

Revision ID: 1d102cb8c9a2
Revises: 3ae701cc923c
Create Date: 2026-07-23 23:32:54.105151

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1d102cb8c9a2'
down_revision: Union[str, Sequence[str], None] = '3ae701cc923c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tracks', sa.Column('genres', sa.String(length=512), nullable=True))
    op.add_column('ingestion_requests', sa.Column('genres', sa.String(length=512), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ingestion_requests', 'genres')
    op.drop_column('tracks', 'genres')
