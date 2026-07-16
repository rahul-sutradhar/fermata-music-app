from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt
from passlib.context import CryptContext

from app.core.config import settings


# Use Argon2 for password hashing (handles long passwords without 72-byte limit)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Refresh token validity (7 days by default)
REFRESH_TOKEN_EXPIRE_DAYS = 7


def hash_password(password: str) -> str:
    """Return an Argon2 hash for the given plain-text password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against an existing Argon2 hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: int) -> str:
    """Create a JWT access token for the given subject (user id)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: Dict[str, Any] = {"sub": str(subject), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token() -> str:
    """Create a refresh token (opaque random string)."""
    import secrets
    return secrets.token_urlsafe(32)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode a JWT access token and return its payload."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


def get_refresh_token_expiry() -> datetime:
    """Get the expiry datetime for a refresh token."""
    return datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)


