"""Tests for authentication endpoints."""

import pytest
from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.oauth import hash_password
from app.models.refresh_token import RefreshToken
from app.models.user import User


class TestUserRegistration:
    """Test user registration endpoint."""

    def test_register_success(self, client):
        """Test successful user registration."""
        response = client.post(
            "/auth/register",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "secure_password_123",
            },
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        data = response.json()
        assert data["username"] == "newuser"
        assert data["email"] == "newuser@example.com"
        assert "id" in data

    def test_register_duplicate_username(self, client, db_session):
        """Test registration fails with duplicate username."""
        user = User(
            username="existing",
            email="existing@example.com",
            hashed_password=hash_password("pass"),
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(
            "/auth/register",
            json={
                "username": "existing",
                "email": "another@example.com",
                "password": "secure_password_123",
            },
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already taken" in response.json()["detail"]

    def test_register_duplicate_email(self, client, db_session):
        """Test registration fails with duplicate email."""
        user = User(
            username="existing",
            email="existing@example.com",
            hashed_password=hash_password("pass"),
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(
            "/auth/register",
            json={
                "username": "newuser",
                "email": "existing@example.com",
                "password": "secure_password_123",
            },
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already registered" in response.json()["detail"]

    def test_register_weak_password(self, client):
        """Test registration fails with weak password."""
        response = client.post(
            "/auth/register",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "short",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestUserLogin:
    """Test user login endpoint."""

    def test_login_success(self, client, db_session):
        """Test successful login returns access and refresh tokens."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_stores_refresh_token(self, client, db_session):
        """Test that login stores refresh token in database."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_200_OK

        # Verify refresh token is stored
        refresh_tokens = db_session.scalars(
            select(RefreshToken).where(RefreshToken.user_id == user.id)
        ).all()
        assert len(refresh_tokens) == 1
        assert not refresh_tokens[0].is_revoked

    def test_login_invalid_username(self, client):
        """Test login fails with invalid username."""
        response = client.post(
            "/auth/login",
            data={
                "username": "nonexistent",
                "password": "password123",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Incorrect" in response.json()["detail"]

    def test_login_invalid_password(self, client, db_session):
        """Test login fails with invalid password."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "wrongpassword",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestRefreshToken:
    """Test refresh token endpoint."""

    def test_refresh_token_success(self, client, db_session):
        """Test exchanging refresh token for new access token."""
        # Create user and login
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        login_response = client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "password123",
            },
        )
        refresh_token = login_response.json()["refresh_token"]

        # Use refresh token
        response = client.post(
            "/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_refresh_token_invalid(self, client):
        """Test refresh with invalid token fails."""
        response = client.post(
            "/auth/refresh",
            json={"refresh_token": "invalid_token_12345"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_refresh_token_revoked(self, client, db_session):
        """Test refresh with revoked token fails."""
        # Create user and login
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        login_response = client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "password123",
            },
        )
        refresh_token = login_response.json()["refresh_token"]

        # Revoke the token
        db_session.execute(
            update(RefreshToken).where(RefreshToken.user_id == user.id).values(is_revoked=True)
        )
        db_session.commit()

        # Try to use revoked token
        response = client.post(
            "/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestLogout:
    """Test logout endpoint."""

    def test_logout_success(self, client, db_session):
        """Test successful logout revokes tokens."""
        # Create user and login
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        login_response = client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "password123",
            },
        )
        access_token = login_response.json()["access_token"]

        # Logout
        response = client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify all tokens are revoked
        revoked_tokens = db_session.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user.id,
                RefreshToken.is_revoked == True,
            )
        ).all()
        assert len(revoked_tokens) > 0

    def test_logout_specific_token(self, client, db_session):
        """Test logout with specific refresh token revokes only that token."""
        # Create user and login twice (get 2 tokens)
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        login1 = client.post(
            "/auth/login",
            data={"username": "testuser", "password": "password123"},
        )
        token1 = login1.json()["access_token"]
        refresh1 = login1.json()["refresh_token"]

        login2 = client.post(
            "/auth/login",
            data={"username": "testuser", "password": "password123"},
        )
        refresh2 = login2.json()["refresh_token"]

        # Logout with specific refresh token
        response = client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {token1}"},
            json={"refresh_token": refresh1},
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify only one token is revoked
        all_tokens = db_session.scalars(
            select(RefreshToken).where(RefreshToken.user_id == user.id)
        ).all()
        revoked_count = sum(1 for t in all_tokens if t.is_revoked)
        assert revoked_count == 1


class TestGetCurrentUser:
    """Test current user endpoint."""

    def test_get_current_user_success(self, auth_client, current_user):
        """Test getting current user profile."""
        response = auth_client.get("/auth/me")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == current_user.id
        assert data["username"] == current_user.username
        assert data["email"] == current_user.email

    def test_get_current_user_unauthorized(self, client):
        """Test getting current user without auth fails."""
        response = client.get("/auth/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestProtectedEndpoints:
    """Test that protected endpoints require authentication."""

    def test_library_requires_auth(self, client):
        """Test library endpoint requires authentication."""
        response = client.get("/me/library")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_player_requires_auth(self, client):
        """Test player endpoint requires authentication."""
        response = client.get("/me/player")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_playlists_requires_auth(self, client):
        """Test playlist endpoint requires authentication."""
        response = client.get("/me/playlists")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_protected_endpoint_with_valid_token(self, client, db_session):
        """Test protected endpoint works with valid token."""
        # Create user and login
        user = User(
            username="testuser",
            email="testuser@example.com",
            hashed_password=hash_password("password123"),
        )
        db_session.add(user)
        db_session.commit()

        login_response = client.post(
            "/auth/login",
            data={
                "username": "testuser",
                "password": "password123",
            },
        )
        access_token = login_response.json()["access_token"]

        # Access protected endpoint
        response = client.get(
            "/me/playlists",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == status.HTTP_200_OK
