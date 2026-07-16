"""Tests for access and refresh token behavior."""

from datetime import datetime, timezone
import time

from sqlalchemy import select, update

from app.core.oauth import decode_access_token, verify_password, hash_password
from app.models.refresh_token import RefreshToken
from app.models.user import User


def test_access_token_contains_subject_and_exp(client, db_session):
    user = User(username="tokenuser", email="token@example.com", hashed_password=hash_password("safe_pass"))
    db_session.add(user)
    db_session.commit()

    resp = client.post(
        "/auth/login",
        data={"username": "tokenuser", "password": "safe_pass"},
    )
    assert resp.status_code == 200
    access = resp.json()["access_token"]

    payload = decode_access_token(access)
    assert payload["sub"] == str(user.id)
    assert "exp" in payload
    assert payload["exp"] > int(time.time())


def test_refresh_token_stored_hashed_and_verifiable(client, db_session):
    user = User(username="rtuser", email="rt@example.com", hashed_password=hash_password("safe_pass"))
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
    assert stored.token_hash != refresh
    assert verify_password(refresh, stored.token_hash)


def test_refresh_exchange_returns_new_access_token(client, db_session):
    user = User(username="exuser", email="ex@example.com", hashed_password=hash_password("safe_pass"))
    db_session.add(user)
    db_session.commit()

    login = client.post(
        "/auth/login",
        data={"username": "exuser", "password": "safe_pass"},
    )
    assert login.status_code == 200
    refresh = login.json()["refresh_token"]

    resp = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    access = resp.json()["access_token"]
    payload = decode_access_token(access)
    assert payload["sub"] == str(user.id)


def test_revoked_refresh_token_fails(client, db_session):
    user = User(username="revuser", email="rev@example.com", hashed_password=hash_password("safe_pass"))
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
