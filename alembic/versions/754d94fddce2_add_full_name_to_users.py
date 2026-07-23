"""add_full_name_to_users

Revision ID: 754d94fddce2
Revises: 1d102cb8c9a2
Create Date: 2026-07-24 00:31:36.905752

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '754d94fddce2'
down_revision: Union[str, Sequence[str], None] = '1d102cb8c9a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('full_name', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'full_name')
