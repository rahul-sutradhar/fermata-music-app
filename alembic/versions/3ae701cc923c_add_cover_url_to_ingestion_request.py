"""add_cover_url_to_ingestion_request

Revision ID: 3ae701cc923c
Revises: 4a428744b6df
Create Date: 2026-07-23 18:58:05.061812

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3ae701cc923c'
down_revision: Union[str, Sequence[str], None] = '4a428744b6df'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('ingestion_requests', sa.Column('cover_url', sa.String(length=1024), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ingestion_requests', 'cover_url')
