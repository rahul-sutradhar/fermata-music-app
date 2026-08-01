"""add_indexes_to_recently_played

Revision ID: 05e8b09d474c
Revises: a1b2c3d4e5f6
Create Date: 2026-08-01 12:01:52.293501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '05e8b09d474c'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add index on (user_id, played_at DESC) for sorting user's recently played history
    op.create_index(
        "idx_recently_played_user_played_at",
        "recently_played",
        ["user_id", sa.text("played_at DESC")],
    )
    # Add index on (user_id, track_id) for aggregation and stats grouping
    op.create_index(
        "idx_recently_played_user_track",
        "recently_played",
        ["user_id", "track_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_recently_played_user_track", table_name="recently_played")
    op.drop_index("idx_recently_played_user_played_at", table_name="recently_played")
