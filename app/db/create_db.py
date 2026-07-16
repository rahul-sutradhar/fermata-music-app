"""Create the fermata database if it does not exist."""

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from app.core.config import settings


def create_database() -> None:
    # Connect to the default postgres database to create fermata.
    admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
    conn = psycopg2.connect(admin_url)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = 'fermata'")
            if cur.fetchone() is None:
                cur.execute("CREATE DATABASE fermata")
                print("Created database fermata")
            else:
                print("Database fermata already exists")
    finally:
        conn.close()


if __name__ == "__main__":
    create_database()
