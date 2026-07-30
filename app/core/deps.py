from typing import Annotated

from datetime import datetime
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.models.access_token import AccessToken
from app.core.oauth import hash_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token_hash = hash_token(token)
    token_obj = db.scalar(
        select(AccessToken).where(
            AccessToken.token_hash == token_hash,
            AccessToken.expires_at > datetime.utcnow()
        )
    )
    if token_obj is None:
        raise credentials_exception

    user = db.scalar(select(User).where(User.id == token_obj.user_id))
    if user is None:
        raise credentials_exception
    
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required"
        )
        
    return user


DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_master_admin(current_user: CurrentUser) -> User:
    """Allows only users with role == 'master_admin'.

    This role can ONLY be set manually in the database — no API endpoint
    can assign or promote to it.
    """
    if not current_user.is_master_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


def get_current_admin(current_user: CurrentUser) -> User:
    """Allows any admin — both 'admin' and 'master_admin' roles."""
    if not current_user.is_any_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


def get_current_artist_or_admin(current_user: CurrentUser) -> User:
    """Allows artists, admins, and master admins."""
    if current_user.role not in ("admin", "master_admin", "artist"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


CurrentMasterAdmin = Annotated[User, Depends(get_current_master_admin)]
CurrentAdmin = Annotated[User, Depends(get_current_admin)]
CurrentArtistOrAdmin = Annotated[User, Depends(get_current_artist_or_admin)]
