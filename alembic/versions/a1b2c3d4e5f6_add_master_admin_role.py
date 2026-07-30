"""add_master_admin_role

Revision ID: a1b2c3d4e5f6
Revises: f8f44fd6b62b
Create Date: 2026-07-30

Adds 'master_admin' as a valid discriminator value for the ``role`` column
on the ``users`` table.  No new table is needed — MasterAdmin uses Single
Table Inheritance (STI), sharing the existing ``users`` table.

The ``master_admin`` role can ONLY be assigned directly in the database.
No API endpoint exposes it as a valid input value.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f8f44fd6b62b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No DDL change needed for STI — the discriminator column already accepts
    any string value.  This migration exists purely to document the intent and
    to ensure Alembic history is complete.

    Optionally, you may add a CHECK constraint here if you want to enforce
    allowed values at the DB level:

        op.execute(
            "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;"
            "ALTER TABLE users ADD CONSTRAINT users_role_check "
            "CHECK (role IN ('user', 'artist', 'admin', 'master_admin'));"
        )
    """
    pass


def downgrade() -> None:
    """On downgrade, convert any master_admin rows back to admin so the
    discriminator constraint (if added) stays valid.
    """
    op.execute(
        "UPDATE users SET role = 'admin' WHERE role = 'master_admin'"
    )
