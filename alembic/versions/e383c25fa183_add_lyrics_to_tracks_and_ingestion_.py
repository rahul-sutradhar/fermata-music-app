"""add_lyrics_to_tracks_and_ingestion_requests

Revision ID: e383c25fa183
Revises: 754d94fddce2
Create Date: 2026-07-24 00:39:42.639615

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e383c25fa183'
down_revision: Union[str, Sequence[str], None] = '754d94fddce2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tracks', sa.Column('lyrics', sa.Text(), nullable=True))
    op.add_column('ingestion_requests', sa.Column('lyrics', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ingestion_requests', 'lyrics')
    op.drop_column('tracks', 'lyrics')
