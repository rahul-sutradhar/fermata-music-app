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
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    
    # Update tracks
    tracks_cols = [c['name'] for c in inspector.get_columns('tracks')]
    if 'genres' not in tracks_cols:
        op.add_column('tracks', sa.Column('genres', sa.String(length=512), nullable=True))
        
    # Update ingestion_requests
    if 'ingestion_requests' in inspector.get_table_names():
        ir_cols = [c['name'] for c in inspector.get_columns('ingestion_requests')]
        if 'genres' not in ir_cols:
            op.add_column('ingestion_requests', sa.Column('genres', sa.String(length=512), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    
    # Downgrade ingestion_requests
    if 'ingestion_requests' in inspector.get_table_names():
        ir_cols = [c['name'] for c in inspector.get_columns('ingestion_requests')]
        if 'genres' in ir_cols:
            op.drop_column('ingestion_requests', 'genres')
            
    # Downgrade tracks
    tracks_cols = [c['name'] for c in inspector.get_columns('tracks')]
    if 'genres' in tracks_cols:
        op.drop_column('tracks', 'genres')
