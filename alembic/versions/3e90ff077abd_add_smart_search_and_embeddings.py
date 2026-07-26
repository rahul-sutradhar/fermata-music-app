"""add_smart_search_and_embeddings

Revision ID: 3e90ff077abd
Revises: 7e4cd677b434
Create Date: 2026-07-25 16:43:57.810679

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e90ff077abd'
down_revision: Union[str, Sequence[str], None] = '7e4cd677b434'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    
    # 2. Add columns to tracks table
    op.execute("ALTER TABLE tracks ADD COLUMN IF NOT EXISTS embedding vector(384);")
    op.execute("ALTER TABLE tracks ADD COLUMN IF NOT EXISTS search_tsv tsvector;")
    op.execute(
        "ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics_tsv tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', coalesce(lyrics, ''))) STORED;"
    )
    
    # 3. Create GIN indexes for full text search
    op.execute("CREATE INDEX IF NOT EXISTS idx_tracks_search_tsv ON tracks USING gin(search_tsv);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tracks_lyrics_tsv ON tracks USING gin(lyrics_tsv);")
    
    # 4. Create HNSW index for tracks semantic vector matching
    op.execute("CREATE INDEX IF NOT EXISTS idx_tracks_embedding ON tracks USING hnsw (embedding vector_cosine_ops);")
    
    # 5. Create lyric_chunks table
    op.execute(
        "CREATE TABLE IF NOT EXISTS lyric_chunks ("
        "  id SERIAL PRIMARY KEY,"
        "  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,"
        "  chunk_index INTEGER NOT NULL,"
        "  text TEXT NOT NULL,"
        "  embedding vector(384)"
        ");"
    )
    
    # 6. Create HNSW index for lyric chunk semantic matching
    op.execute("CREATE INDEX IF NOT EXISTS idx_lyric_chunks_embedding ON lyric_chunks USING hnsw (embedding vector_cosine_ops);")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS idx_lyric_chunks_embedding;")
    op.execute("DROP TABLE IF EXISTS lyric_chunks;")
    op.execute("DROP INDEX IF EXISTS idx_tracks_embedding;")
    op.execute("DROP INDEX IF EXISTS idx_tracks_lyrics_tsv;")
    op.execute("DROP INDEX IF EXISTS idx_tracks_search_tsv;")
    op.execute("ALTER TABLE tracks DROP COLUMN IF EXISTS lyrics_tsv;")
    op.execute("ALTER TABLE tracks DROP COLUMN IF EXISTS search_tsv;")
    op.execute("ALTER TABLE tracks DROP COLUMN IF EXISTS embedding;")
