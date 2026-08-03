import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

# Set stdout encoding to UTF-8
sys.stdout.reconfigure(encoding='utf-8')

with engine.begin() as conn:
    print("All artists in 'artists' table:")
    rows = conn.execute(text("SELECT id, name FROM artists")).fetchall()
    for row in rows:
        print(f"  Artist ID: {row[0]}, Name: {row[1]}")
        
    print("\nAll users with role = 'artist' in 'users' table:")
    rows2 = conn.execute(text("SELECT id, username, email, role FROM users WHERE role = 'artist'")).fetchall()
    for row in rows2:
        print(f"  User ID: {row[0]}, Username: {row[1]}, Email: {row[2]}, Role: {row[3]}")
