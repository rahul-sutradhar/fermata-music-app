"""add_name_to_admins

Revision ID: e3c23a7e5812
Revises: f8f44fd6b62b
Create Date: 2026-07-20 17:03:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3c23a7e5812'
down_revision: Union[str, Sequence[str], None] = 'f8f44fd6b62b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: Add name column to admins table and populate it from users.username."""
    # 1. Add column as nullable first
    op.add_column('admins', sa.Column('name', sa.String(length=255), nullable=True))
    
    # 2. Populate name from users.username (or fallback to 'Admin' if username is null)
    op.execute(
        "UPDATE admins SET name = COALESCE((SELECT username FROM users WHERE users.id = admins.id), 'Admin')"
    )
    
    # 3. Alter column to be non-nullable
    op.alter_column('admins', 'name', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('admins', 'name')
