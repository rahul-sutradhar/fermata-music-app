"""RBAC tests — verifies the three-tier permission model:

  master_admin  -> full access to everything
  admin         -> can list/update users & artists (not admin accounts),
                   blocked from admin promotion
  artist        -> CRUD limited to their own tracks/albums
  user          -> read-only, no write access

New rule (enforced here):
  Only master_admin can change a role TO or FROM 'admin'.
"""

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.main import app
from app.models.admin import Admin
from app.models.artist import Artist
from app.models.master_admin import MasterAdmin
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _override_as(user: User):
    app.dependency_overrides[deps.get_current_user] = lambda: user
    app.dependency_overrides[deps.get_current_admin] = lambda: user
    app.dependency_overrides[deps.get_current_master_admin] = lambda: user
    app.dependency_overrides[deps.get_current_artist_or_admin] = lambda: user


def _clear():
    app.dependency_overrides.pop(deps.get_current_user, None)
    app.dependency_overrides.pop(deps.get_current_admin, None)
    app.dependency_overrides.pop(deps.get_current_master_admin, None)
    app.dependency_overrides.pop(deps.get_current_artist_or_admin, None)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def master_admin_user(db_session):
    u = MasterAdmin(
        username="master_rbac",
        email="master_rbac@test.com",
        hashed_password="x",
        role="master_admin",
        is_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture()
def admin_user(db_session):
    u = Admin(
        username="other_admin_rbac",
        email="otheradmin_rbac@test.com",
        hashed_password="x",
        role="admin",
        name="Other Admin",
        is_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture()
def artist_user(db_session):
    u = Artist(
        username="artist_rbac",
        email="artist_rbac@test.com",
        hashed_password="x",
        role="artist",
        name="RBAC Artist",
        is_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture()
def regular_user(db_session):
    u = User(
        username="plain_rbac",
        email="plain_rbac@test.com",
        hashed_password="x",
        role="user",
        is_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


# ---------------------------------------------------------------------------
# User model property tests
# ---------------------------------------------------------------------------

def test_is_master_admin_property(master_admin_user, admin_user, artist_user, regular_user):
    assert master_admin_user.is_master_admin is True
    assert admin_user.is_master_admin is False
    assert artist_user.is_master_admin is False
    assert regular_user.is_master_admin is False


def test_is_any_admin_property(master_admin_user, admin_user, artist_user, regular_user):
    assert master_admin_user.is_any_admin is True
    assert admin_user.is_any_admin is True
    assert artist_user.is_any_admin is False
    assert regular_user.is_any_admin is False


# ---------------------------------------------------------------------------
# Master admin dep: blocks non-master from master-only endpoints
# (override only get_current_user; let the real get_current_master_admin run)
# ---------------------------------------------------------------------------

def test_master_admin_dep_blocks_admin(admin_user):
    """get_current_master_admin must raise 403 for a plain admin."""
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException) as exc_info:
        deps.get_current_master_admin(admin_user)
    assert exc_info.value.status_code == 403


def test_master_admin_dep_blocks_artist(artist_user):
    """get_current_master_admin must raise 403 for an artist."""
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException) as exc_info:
        deps.get_current_master_admin(artist_user)
    assert exc_info.value.status_code == 403


def test_master_admin_dep_allows_master(master_admin_user):
    """get_current_master_admin must return the user for a master_admin."""
    result = deps.get_current_master_admin(master_admin_user)
    assert result is master_admin_user


# ---------------------------------------------------------------------------
# Only master admin can change role TO or FROM 'admin'
# ---------------------------------------------------------------------------

def test_admin_cannot_promote_user_to_admin(client, admin_user, db_session):
    """Non-master admin CANNOT promote a user to 'admin'."""
    target = User(
        username="promote_target",
        email="promote_target@test.com",
        hashed_password="x",
        role="user",
        is_verified=True,
    )
    db_session.add(target)
    db_session.commit()

    _override_as(admin_user)
    resp = client.patch(f"/admin/users/{target.id}", json={"role": "admin"})
    assert resp.status_code == 403
    _clear()


def test_admin_cannot_promote_artist_to_admin(client, admin_user, artist_user):
    """Non-master admin CANNOT promote an artist to 'admin'."""
    _override_as(admin_user)
    resp = client.patch(f"/admin/users/{artist_user.id}", json={"role": "admin"})
    assert resp.status_code == 403
    _clear()


def test_admin_cannot_demote_admin_to_user(client, admin_user, db_session):
    """Non-master admin CANNOT demote an admin back to user."""
    victim = Admin(
        username="victim_admin_rbac",
        email="victim_admin_rbac@test.com",
        hashed_password="x",
        role="admin",
        name="Victim",
        is_verified=True,
    )
    db_session.add(victim)
    db_session.commit()

    _override_as(admin_user)
    resp = client.patch(f"/admin/users/{victim.id}", json={"role": "user"})
    assert resp.status_code == 403
    _clear()


def test_master_admin_can_promote_user_to_admin(client, master_admin_user, db_session):
    """Master admin CAN promote a user to 'admin'."""
    target = User(
        username="for_admin_promo",
        email="for_admin_promo@test.com",
        hashed_password="x",
        role="user",
        is_verified=True,
    )
    db_session.add(target)
    db_session.commit()

    _override_as(master_admin_user)
    resp = client.patch(f"/admin/users/{target.id}", json={"role": "admin"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"
    _clear()


def test_master_admin_can_demote_admin_to_user(client, master_admin_user, db_session):
    """Master admin CAN demote an admin back to user."""
    victim = Admin(
        username="demote_me_rbac",
        email="demote_me_rbac@test.com",
        hashed_password="x",
        role="admin",
        name="Demote Me",
        is_verified=True,
    )
    db_session.add(victim)
    db_session.commit()

    _override_as(master_admin_user)
    resp = client.patch(f"/admin/users/{victim.id}", json={"role": "user"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "user"
    _clear()


# ---------------------------------------------------------------------------
# Admin can update users / artists (non-role-to-admin changes)
# ---------------------------------------------------------------------------

def test_admin_can_patch_regular_user(client, admin_user, db_session):
    """Non-master admin CAN patch a regular user's username."""
    target = User(
        username="patchable_rbac",
        email="patchable_rbac@test.com",
        hashed_password="x",
        role="user",
        is_verified=True,
    )
    db_session.add(target)
    db_session.commit()

    _override_as(admin_user)
    resp = client.patch(f"/admin/users/{target.id}", json={"username": "patched_rbac"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "patched_rbac"
    _clear()


def test_admin_can_promote_user_to_artist(client, admin_user, db_session):
    """Non-master admin CAN promote user -> artist."""
    target = User(
        username="u2a_rbac",
        email="u2a_rbac@test.com",
        hashed_password="x",
        role="user",
        is_verified=True,
    )
    db_session.add(target)
    db_session.commit()

    _override_as(admin_user)
    resp = client.patch(f"/admin/users/{target.id}", json={"role": "artist"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "artist"
    _clear()


def test_admin_can_demote_artist_to_user(client, admin_user, artist_user):
    """Non-master admin CAN demote artist -> user (if no albums)."""
    _override_as(admin_user)
    resp = client.patch(f"/admin/users/{artist_user.id}", json={"role": "user"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "user"
    _clear()


# ---------------------------------------------------------------------------
# Master admin account is read-only via API
# ---------------------------------------------------------------------------

def test_master_admin_account_is_read_only(client, master_admin_user, admin_user):
    """No one can patch the master admin account via the API."""
    _override_as(admin_user)
    resp = client.patch(f"/admin/users/{master_admin_user.id}", json={"username": "hacked"})
    assert resp.status_code in (400, 403)
    _clear()


# ---------------------------------------------------------------------------
# Admin cannot create / delete users (master_admin only)
# ---------------------------------------------------------------------------

def test_admin_cannot_create_user(client, admin_user):
    """POST /admin/users requires master_admin."""
    app.dependency_overrides.clear()
    app.dependency_overrides[deps.get_current_user] = lambda: admin_user
    app.dependency_overrides[deps.get_current_admin] = lambda: admin_user
    resp = client.post(
        "/admin/users",
        json={"username": "newone_rbac", "email": "newone_rbac@test.com", "password": "secure123", "role": "user"},
    )
    assert resp.status_code == 403
    _clear()


def test_admin_cannot_delete_user(client, admin_user, regular_user):
    """DELETE /admin/users/{id} requires master_admin."""
    app.dependency_overrides.clear()
    app.dependency_overrides[deps.get_current_user] = lambda: admin_user
    resp = client.delete(f"/admin/users/{regular_user.id}")
    assert resp.status_code == 403
    _clear()


# ---------------------------------------------------------------------------
# Service guard: admin accounts cannot be artists
# ---------------------------------------------------------------------------

def test_admin_cannot_be_linked_as_artist(client, admin_user, master_admin_user):
    """create_artist with user_id pointing to an admin must return 400."""
    _override_as(master_admin_user)
    resp = client.post("/artists", json={"name": "Should Fail", "user_id": admin_user.id})
    assert resp.status_code == 400
    assert "administrator" in resp.json()["detail"].lower()
    _clear()


# ---------------------------------------------------------------------------
# Artist cannot write to another artist's album
# ---------------------------------------------------------------------------

def test_artist_cannot_create_album_for_another_artist(client, artist_user, db_session):
    """Artist creating an album for a different artist_id must get 403."""
    other = Artist(
        username="other_a_rbac",
        email="other_a_rbac@test.com",
        hashed_password="x",
        role="artist",
        name="Other",
        is_verified=True,
    )
    db_session.add(other)
    db_session.commit()

    _override_as(artist_user)
    resp = client.post("/albums", json={"title": "Stolen Album", "artist_id": other.id})
    assert resp.status_code == 403
    _clear()
