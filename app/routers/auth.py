from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession
from app.core.oauth import (
    create_access_token,
    create_refresh_token,
    get_refresh_token_expiry,
    hash_password,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.user import RefreshTokenRequest, Token, UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: DbSession) -> UserResponse:
    """Register a new user."""
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=Token)
def login(db: DbSession, form_data: OAuth2PasswordRequestForm = Depends()) -> Token:
    """OAuth2 password flow login: validate credentials and return JWT access + refresh tokens."""
    user = db.scalar(select(User).where(User.username == form_data.username))
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(subject=user.id)
    refresh_token_str = create_refresh_token()
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_password(refresh_token_str),
        expires_at=get_refresh_token_expiry(),
    )
    db.add(refresh_token)
    db.commit()
    return Token(access_token=access_token, refresh_token=refresh_token_str, token_type="bearer")


@router.post("/refresh", response_model=Token)
def refresh_access_token(payload: RefreshTokenRequest, db: DbSession) -> Token:
    """Use refresh token to get a new access token."""
    # Find refresh tokens for this user
    refresh_tokens = db.scalars(
        select(RefreshToken).where(
            RefreshToken.is_revoked == False,
            RefreshToken.expires_at > datetime.utcnow(),
        )
    ).all()

    # Verify the provided refresh token against stored hashes
    matched_token = None
    for stored_token in refresh_tokens:
        if verify_password(payload.refresh_token, stored_token.token_hash):
            matched_token = stored_token
            break

    if not matched_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Issue new access token
    user = db.get(User, matched_token.user_id)
    access_token = create_access_token(subject=user.id)
    return Token(access_token=access_token, token_type="bearer")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: DbSession,
    current_user: CurrentUser,
    payload: RefreshTokenRequest | None = Body(None),
) -> None:
    """Logout: revoke all or specific refresh token."""
    refresh_token = payload.refresh_token if payload is not None else None
    if refresh_token:
        # Revoke specific token
        tokens = db.scalars(
            select(RefreshToken).where(RefreshToken.user_id == current_user.id)
        ).all()
        for token in tokens:
            if verify_password(refresh_token, token.token_hash):
                token.is_revoked = True
                break
    else:
        # Revoke all tokens for this user using SQLAlchemy update()
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == current_user.id)
            .values(is_revoked=True)
        )
    db.commit()


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: CurrentUser) -> UserResponse:
    """Get current authenticated user's profile."""
    return UserResponse.model_validate(current_user)
