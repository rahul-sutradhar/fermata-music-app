"""Tests for authentication endpoints with timing protections, OTP verification, lockouts, and CAPTCHAs."""

import time
import pytest
from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.oauth import hash_password, hash_token
from app.models.refresh_token import RefreshToken
from app.models.access_token import AccessToken
from app.models.user import User
from app.models.otp import UserOTP
from app.routers.auth import cache_get, cache_set, cache_delete


class TestUserRegistration:
    """Test user registration and verification endpoints."""

    def test_register_success(self, client, db_session):
        """Test successful registration returns identical success message."""
        response = client.post(
            "/auth/register",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "secure_password_123",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["message"] == "Verification code sent. Please check your email."

        # Verify user is created in database as unverified
        user = db_session.scalar(select(User).where(User.username == "newuser"))
        assert user is not None
        assert user.is_verified is False

        # Verify OTP is created
        otp_rec = db_session.scalar(select(UserOTP).where(UserOTP.user_id == user.id))
        assert otp_rec is not None
        assert otp_rec.otp_code == "123456"

    def test_register_user_enumeration_prevention(self, client, db_session):
        """Test registering with duplicate username or email returns the exact same success response."""
        user = User(
            username="existing",
            email="existing@example.com",
            hashed_password=hash_password("pass"),
            is_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        # Try to register with same username/email
        response = client.post(
            "/auth/register",
            json={
                "username": "existing",
                "email": "another@example.com",
                "password": "secure_password_123",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["message"] == "Verification code sent. Please check your email."

    def test_verify_otp_success(self, client, db_session):
        """Test successful verification updates user to is_verified=True."""
        user = User(
            username="unverified",
            email="unverified@example.com",
            hashed_password=hash_password("pass"),
            is_verified=False,
        )
        db_session.add(user)
        db_session.commit()

        otp_rec = UserOTP(
            user_id=user.id,
            otp_code="111111",
            otp_type="email_verification",
            expires_at=datetime_utcnow_timestamp(900),
        )
        db_session.add(otp_rec)
        db_session.commit()

        # Call verify endpoint with correct code
        response = client.post(
            "/auth/verify-otp",
            json={"email": "unverified@example.com", "otp_code": "111111"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert "verified successfully" in response.json()["message"]

        # Verify DB changes
        db_session.refresh(user)
        assert user.is_verified is True


class TestUserLogin:
    """Test user login endpoint with lockouts and verification checks."""

    def test_login_success(self, client, db_session):
        """Test login works for verified users."""
        user = User(
            username="verifieduser",
            email="verified@example.com",
            hashed_password=hash_password("password123"),
            is_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(
            "/auth/login",
            data={"username": "verifieduser", "password": "password123"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_login_unverified_user_fails(self, client, db_session):
        """Test login fails for unverified users."""
        user = User(
            username="unverifieduser",
            email="unverified@example.com",
            hashed_password=hash_password("password123"),
            is_verified=False,
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(
            "/auth/login",
            data={"username": "unverifieduser", "password": "password123"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "verification required" in response.json()["detail"].lower()

    def test_login_lockout_and_captcha(self, client, db_session):
        """Test client IP lockout after 5 failures and recovery using CAPTCHA."""
        user = User(
            username="loginuser",
            email="login@example.com",
            hashed_password=hash_password("password123"),
            is_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        # Submit 5 failures to trigger lockout
        for _ in range(5):
            client.post(
                "/auth/login",
                data={"username": "loginuser", "password": "wrong_password"},
            )

        # 6th attempt should return 429 Locked Out
        locked_response = client.post(
            "/auth/login",
            data={"username": "loginuser", "password": "password123"},
        )
        assert locked_response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert locked_response.json()["lockout"] is True

        # Fetch CAPTCHA
        captcha_resp = client.get("/auth/captcha")
        assert captcha_resp.status_code == 200
        captcha_id = captcha_resp.json()["captcha_id"]
        
        # Look up captcha solution directly from local cache mock helper
        solution = cache_get(f"captcha_solution:{captcha_id}")
        assert solution is not None

        # Verify captcha
        verify_resp = client.post(
            "/auth/captcha/verify",
            json={"captcha_id": captcha_id, "answer": solution},
        )
        assert verify_resp.status_code == 200
        captcha_token = verify_resp.json()["captcha_token"]

        # Retry login with the bypass token header
        retry_resp = client.post(
            "/auth/login",
            data={"username": "loginuser", "password": "password123"},
            headers={"X-CAPTCHA-Token": captcha_token},
        )
        assert retry_resp.status_code == 200
        assert "access_token" in retry_resp.json()


class TestPasswordRecovery:
    """Test forgot and reset password endpoints."""

    def test_forgot_password_uniform_response(self, client, db_session):
        """Test forgot-password return identical response for existing and non-existing email."""
        # Non-existing email
        response = client.post(
            "/auth/forgot-password",
            json={"email": "nonexistent@example.com"},
        )
        assert response.status_code == 200
        assert "reset code has been sent" in response.json()["message"]

        # Existing email
        user = User(
            username="existinguser",
            email="existing@example.com",
            hashed_password=hash_password("pw"),
            is_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        response2 = client.post(
            "/auth/forgot-password",
            json={"email": "existing@example.com"},
        )
        assert response2.status_code == 200
        assert "reset code has been sent" in response2.json()["message"]


# Helper for utc datetime stamp
def datetime_utcnow_timestamp(offset_seconds: int):
    from datetime import datetime, timedelta
    return datetime.utcnow() + timedelta(seconds=offset_seconds)
