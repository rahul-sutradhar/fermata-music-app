from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from passlib.context import CryptContext

from app.core.config import settings


# Use Argon2 for password hashing (handles long passwords without 72-byte limit)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Refresh token validity (7 days by default)
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Pre-computed dummy hash for user enumeration timing side-channel protection
DUMMY_HASH = pwd_context.hash("dummy_password_for_timing_channel_protection")


def hash_password(password: str) -> str:
    """Return an Argon2 hash for the given plain-text password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against an existing Argon2 hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_token(token: str) -> str:
    """Hash a cryptographically random token using SHA-256 for secure DB storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token() -> str:
    """Create a cryptographically random access token."""
    return secrets.token_urlsafe(32)


def create_refresh_token() -> str:
    """Create a refresh token (opaque random string)."""
    return secrets.token_urlsafe(32)


def get_refresh_token_expiry() -> datetime:
    """Get the expiry datetime for a refresh token."""
    return datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
