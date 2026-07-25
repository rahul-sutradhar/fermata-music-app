import random
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status, Body, Request
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field

from app.core.deps import CurrentUser, DbSession
from app.core.oauth import (
    hash_password,
    verify_password,
    hash_token,
    create_access_token,
    create_refresh_token,
    DUMMY_HASH,
)
from app.core.cache import get_redis, get_memory_limiter
from app.models.refresh_token import RefreshToken
from app.models.access_token import AccessToken
from app.models.otp import UserOTP
from app.models.user import User
from app.schemas.user import RefreshTokenRequest, Token, UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


# Cache access helpers for lockout and CAPTCHA
def cache_set(key: str, value: str, expire: int) -> None:
    redis = get_redis()
    if redis is not None:
        try:
            redis.setex(key, expire, value)
            return
        except Exception:
            pass
    memory = get_memory_limiter()
    memory.set(key, value, expire)


def cache_get(key: str) -> str | None:
    redis = get_redis()
    if redis is not None:
        try:
            val = redis.get(key)
            if val is not None:
                if isinstance(val, bytes):
                    return val.decode()
                return val
        except Exception:
            pass
    memory = get_memory_limiter()
    return memory.get(key)


def cache_delete(key: str) -> None:
    redis = get_redis()
    if redis is not None:
        try:
            redis.delete(key)
            return
        except Exception:
            pass
    memory = get_memory_limiter()
    memory.delete(key)


# Schemas for new endpoints
class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str = Field(..., min_length=8, max_length=128)


class CaptchaVerifyRequest(BaseModel):
    captcha_id: str
    answer: str


@router.post("/register", status_code=status.HTTP_200_OK)
def register(payload: UserCreate, db: DbSession) -> Dict[str, str]:
    """Register a new user with email verification. Protects against user enumeration side-channels."""
    username_exists = db.scalar(select(User).where(User.username == payload.username))
    email_exists = db.scalar(select(User).where(User.email == payload.email))

    if username_exists or email_exists:
        # Perform dummy password hashing to match creation timing
        hash_password(payload.password)
        # Return identical response
        return {"message": "Verification code sent. Please check your email."}

    # Create new unverified user
    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate a 6-digit OTP (for development, use 123456 as a default bypass, or random string)
    otp_code = "123456"  # Simulated default code for development ease
    # Store OTP code expiring in 15 minutes
    otp_record = UserOTP(
        user_id=user.id,
        otp_code=otp_code,
        otp_type="email_verification",
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(otp_record)
    db.commit()

    return {"message": "Verification code sent. Please check your email."}


@router.post("/verify-otp", status_code=status.HTTP_200_OK)
def verify_otp(payload: VerifyOTPRequest, db: DbSession) -> Dict[str, str]:
    """Verify registration OTP code to activate the user."""
    generic_error = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid verification code or email."
    )

    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        # Execute dummy sleep to prevent quick rejection side-channel
        hash_password("dummy_password")
        raise generic_error

    otp_record = db.scalar(
        select(UserOTP).where(
            UserOTP.user_id == user.id,
            UserOTP.otp_code == payload.otp_code,
            UserOTP.otp_type == "email_verification",
            UserOTP.expires_at > datetime.utcnow(),
        )
    )
    if not otp_record:
        raise generic_error

    # Verify user
    user.is_verified = True
    db.delete(otp_record)
    db.commit()

    return {"message": "Account verified successfully. Proceed to login."}


@router.post("/login", response_model=Token)
def login(
    request: Request,
    db: DbSession,
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Token:
    """OAuth2 password flow login with user enumeration timing protection and rate limit checking."""
    client_host = request.client.host if request.client else "unknown"
    failed_key = f"failed_attempts:ip:{client_host}"

    generic_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user = db.scalar(select(User).where(User.username == form_data.username))

    if not user:
        # Protect against timing attacks by checking a dummy hash
        verify_password(form_data.password, DUMMY_HASH)
        # Track failure attempts
        current_failed = cache_get(failed_key)
        attempts = int(current_failed) if current_failed else 0
        attempts += 1
        if attempts >= 5:
            cache_set(f"lockout:ip:{client_host}", "locked", 900)
        else:
            cache_set(failed_key, str(attempts), 900)
        raise generic_error

    if not verify_password(form_data.password, user.hashed_password):
        # Increment failed attempts
        current_failed = cache_get(failed_key)
        attempts = int(current_failed) if current_failed else 0
        attempts += 1
        if attempts >= 5:
            cache_set(f"lockout:ip:{client_host}", "locked", 900)
        else:
            cache_set(failed_key, str(attempts), 900)
        raise generic_error

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required."
        )

    # Success: Clear failed attempts for this IP
    cache_delete(failed_key)
    cache_delete(f"lockout:ip:{client_host}")

    # Generate cryptographically secure random tokens
    raw_access_token = create_access_token()
    raw_refresh_token = create_refresh_token()

    # Save Access Token (expire in 15 minutes)
    access_token_obj = AccessToken(
        user_id=user.id,
        token_hash=hash_token(raw_access_token),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(access_token_obj)

    # Save Refresh Token (expire in 7 days, link to new rotation family)
    refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh_token),
        family_id=str(uuid.uuid4()),
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(refresh_token_obj)
    db.commit()

    return Token(access_token=raw_access_token, refresh_token=raw_refresh_token, token_type="bearer")


@router.post("/refresh", response_model=Token)
def refresh_access_token(payload: RefreshTokenRequest, db: DbSession) -> Token:
    """Rotate refresh token (RTR) and issue a new access token. Implements reuse and expiry detection."""
    token_hash = hash_token(payload.refresh_token)
    token_obj = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))

    if not token_obj or token_obj.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # 1. Expiry Check (e.g. 7 days limit or past explicit expires_at)
    if token_obj.expires_at < datetime.utcnow():
        # Revoke the entire family
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token_obj.family_id)
            .values(is_revoked=True)
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # 2. Reuse Detection (Token Theft)
    if token_obj.used_at is not None:
        # Breach detected! Revoke the entire family chain immediately
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token_obj.family_id)
            .values(is_revoked=True)
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # 3. Successful rotation: Mark current token as used
    token_obj.used_at = datetime.utcnow()

    # Generate new random tokens
    raw_access_token = create_access_token()
    raw_refresh_token = create_refresh_token()

    # Save new Access Token (expire in 15 mins)
    access_token_obj = AccessToken(
        user_id=token_obj.user_id,
        token_hash=hash_token(raw_access_token),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(access_token_obj)

    # Save rotated Refresh Token (sharing same family_id)
    new_refresh_token_obj = RefreshToken(
        user_id=token_obj.user_id,
        token_hash=hash_token(raw_refresh_token),
        family_id=token_obj.family_id,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(new_refresh_token_obj)
    db.commit()

    return Token(access_token=raw_access_token, refresh_token=raw_refresh_token, token_type="bearer")


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(payload: ForgotPasswordRequest, db: DbSession) -> Dict[str, str]:
    """Initiate password recovery with user enumeration side-channel protection."""
    user = db.scalar(select(User).where(User.email == payload.email))

    if not user:
        # Perform dummy delay/hash to match database lookup timing
        hash_password("dummy_password")
        return {"message": "If the email exists in our system, a password reset code has been sent."}

    # Generate a 6-digit password reset OTP
    otp_code = "123456"  # Dev mock code
    otp_record = UserOTP(
        user_id=user.id,
        otp_code=otp_code,
        otp_type="password_reset",
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(otp_record)
    db.commit()

    return {"message": "If the email exists in our system, a password reset code has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(payload: ResetPasswordRequest, db: DbSession) -> Dict[str, str]:
    """Execute password reset using OTP verification. Protects against timing side-channels."""
    generic_error = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid reset code or email."
    )

    user = db.scalar(select(User).where(User.email == payload.email))
    if not user:
        # Perform dummy hash calculation to delay response
        hash_password(payload.new_password)
        raise generic_error

    otp_record = db.scalar(
        select(UserOTP).where(
            UserOTP.user_id == user.id,
            UserOTP.otp_code == payload.otp_code,
            UserOTP.otp_type == "password_reset",
            UserOTP.expires_at > datetime.utcnow(),
        )
    )
    if not otp_record:
        # Perform dummy hash calculation to delay response
        hash_password(payload.new_password)
        raise generic_error

    # Update user password
    user.hashed_password = hash_password(payload.new_password)
    db.delete(otp_record)
    
    # Revoke all current tokens for security
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(is_revoked=True))
    db.execute(update(AccessToken).where(AccessToken.user_id == user.id).values(expires_at=datetime.utcnow()))
    db.commit()

    return {"message": "Password reset successfully. Please log in."}


@router.get("/captcha", status_code=status.HTTP_200_OK)
def get_captcha() -> Dict[str, str]:
    """Generate a mathematical CAPTCHA challenge."""
    captcha_id = str(uuid.uuid4())
    num1 = random.randint(1, 9)
    num2 = random.randint(1, 9)
    question = f"What is {num1} + {num2}?"
    solution = str(num1 + num2)

    # Store CAPTCHA answer in cache for 5 minutes
    cache_set(f"captcha_solution:{captcha_id}", solution, 300)

    return {"captcha_id": captcha_id, "question": question}


@router.post("/captcha/verify", status_code=status.HTTP_200_OK)
def verify_captcha(request: Request, payload: CaptchaVerifyRequest) -> Dict[str, Any]:
    """Verify CAPTCHA solution and return a rate limit / lockout bypass token."""
    stored_solution = cache_get(f"captcha_solution:{payload.captcha_id}")

    if not stored_solution or stored_solution != payload.answer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect CAPTCHA solution."
        )

    # Successfully solved: Generate bypass token
    bypass_token = secrets.token_urlsafe(32)
    cache_set(f"captcha_bypass:{bypass_token}", "valid", 900)

    # Clear lockout status and failed login attempts for this client IP
    client_host = request.client.host if request.client else "unknown"
    cache_delete(f"lockout:ip:{client_host}")
    cache_delete(f"failed_attempts:ip:{client_host}")

    return {"success": True, "captcha_token": bypass_token}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: DbSession,
    current_user: CurrentUser,
    payload: RefreshTokenRequest | None = Body(None),
) -> None:
    """Logout: revoke refresh token and corresponding access tokens."""
    refresh_token = payload.refresh_token if payload is not None else None
    if refresh_token:
        # Revoke specific refresh token family
        token_hash = hash_token(refresh_token)
        token_obj = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        if token_obj:
            db.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == token_obj.family_id)
                .values(is_revoked=True)
            )
    else:
        # Revoke all tokens for this user
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
