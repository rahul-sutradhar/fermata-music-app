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
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    
    if 'ingestion_requests' not in inspector.get_table_names():
        op.create_table(
            "ingestion_requests",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("thread_id", sa.String(length=255), nullable=False),
            sa.Column("song_name", sa.String(length=255), nullable=False),
            sa.Column("artist_name", sa.String(length=255), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("source_url", sa.String(length=512), nullable=False),
            sa.Column("status", sa.String(length=50), server_default="pending", nullable=False),
            sa.Column("lock_token", sa.String(length=255), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id")
        )
        
    columns = [col['name'] for col in inspector.get_columns('ingestion_requests')]
    if 'cover_url' not in columns:
        op.add_column('ingestion_requests', sa.Column('cover_url', sa.String(length=1024), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    if 'ingestion_requests' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('ingestion_requests')]
        if 'cover_url' in columns:
            op.drop_column('ingestion_requests', 'cover_url')
