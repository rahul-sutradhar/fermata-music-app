"""Tests for access and refresh token behavior, RTR and hashing validation."""

from datetime import datetime, timezone
import time
from sqlalchemy import select, update

from app.core.oauth import hash_token, verify_password, hash_password
from app.models.refresh_token import RefreshToken
from app.models.access_token import AccessToken
from app.models.user import User


def test_access_token_stored_hashed_and_linked(client, db_session):
    user = User(username="tokenuser", email="token@example.com", hashed_password=hash_password("safe_pass"), is_verified=True)
    db_session.add(user)
    db_session.commit()

    resp = client.post(
        "/auth/login",
        data={"username": "tokenuser", "password": "safe_pass"},
    )
    assert resp.status_code == 200
    access = resp.json()["access_token"]

    # Verify access token is random and not a JWT
    assert len(access) >= 32
    assert "." not in access

    # Verify access token is hashed in DB
    tokens = db_session.scalars(select(AccessToken).where(AccessToken.user_id == user.id)).all()
    assert len(tokens) == 1
    assert tokens[0].token_hash == hash_token(access)
    assert tokens[0].expires_at > datetime.utcnow()


def test_refresh_token_stored_hashed_via_sha256(client, db_session):
    user = User(username="rtuser", email="rt@example.com", hashed_password=hash_password("safe_pass"), is_verified=True)
    db_session.add(user)
    db_session.commit()

    resp = client.post(
        "/auth/login",
        data={"username": "rtuser", "password": "safe_pass"},
    )
    assert resp.status_code == 200
    refresh = resp.json()["refresh_token"]

    tokens = db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert len(tokens) == 1
    stored = tokens[0]
    # Check that it uses SHA-256 (not verify_password/argon2)
    assert stored.token_hash == hash_token(refresh)
    assert stored.family_id is not None
    assert stored.used_at is None


def test_refresh_rotation_maintains_family_id(client, db_session):
    user = User(username="exuser", email="ex@example.com", hashed_password=hash_password("safe_pass"), is_verified=True)
    db_session.add(user)
    db_session.commit()

    login = client.post(
        "/auth/login",
        data={"username": "exuser", "password": "safe_pass"},
    )
    assert login.status_code == 200
    refresh = login.json()["refresh_token"]

    # Rotate token
    resp = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    new_refresh = resp.json()["refresh_token"]

    # Check that both tokens belong to the same family and original is marked used
    tokens = db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert len(tokens) == 2
    
    old_token = next(t for t in tokens if t.token_hash == hash_token(refresh))
    new_token = next(t for t in tokens if t.token_hash == hash_token(new_refresh))
    
    assert old_token.used_at is not None
    assert new_token.used_at is None
    assert old_token.family_id == new_token.family_id


def test_revoked_refresh_token_fails(client, db_session):
    user = User(username="revuser", email="rev@example.com", hashed_password=hash_password("safe_pass"), is_verified=True)
    db_session.add(user)
    db_session.commit()

    login = client.post(
        "/auth/login",
        data={"username": "revuser", "password": "safe_pass"},
    )
    assert login.status_code == 200
    refresh = login.json()["refresh_token"]

    # Revoke the token
    db_session.execute(
        update(RefreshToken).where(RefreshToken.user_id == user.id).values(is_revoked=True)
    )
    db_session.commit()

    resp = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 401


def test_refresh_token_reuse_detection_revokes_family(client, db_session):
    user = User(username="theftuser", email="theft@example.com", hashed_password=hash_password("safe_pass"), is_verified=True)
    db_session.add(user)
    db_session.commit()

    login = client.post(
        "/auth/login",
        data={"username": "theftuser", "password": "safe_pass"},
    )
    refresh = login.json()["refresh_token"]

    # First exchange (normal)
    resp1 = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp1.status_code == 200

    # Second exchange (replay/theft)
    resp2 = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp2.status_code == 401

    # Verify all tokens in the family are now revoked
    tokens = db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert all(t.is_revoked for t in tokens)
