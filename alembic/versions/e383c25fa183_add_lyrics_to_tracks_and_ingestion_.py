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
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    
    # Update tracks
    tracks_cols = [c['name'] for c in inspector.get_columns('tracks')]
    if 'lyrics' not in tracks_cols:
        op.add_column('tracks', sa.Column('lyrics', sa.Text(), nullable=True))
        
    # Update ingestion_requests
    if 'ingestion_requests' in inspector.get_table_names():
        ir_cols = [c['name'] for c in inspector.get_columns('ingestion_requests')]
        if 'lyrics' not in ir_cols:
            op.add_column('ingestion_requests', sa.Column('lyrics', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    
    # Downgrade ingestion_requests
    if 'ingestion_requests' in inspector.get_table_names():
        ir_cols = [c['name'] for c in inspector.get_columns('ingestion_requests')]
        if 'lyrics' in ir_cols:
            op.drop_column('ingestion_requests', 'lyrics')
            
    # Downgrade tracks
    tracks_cols = [c['name'] for c in inspector.get_columns('tracks')]
    if 'lyrics' in tracks_cols:
        op.drop_column('tracks', 'lyrics')
