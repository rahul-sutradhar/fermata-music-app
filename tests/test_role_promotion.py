from app.models.user import User
from app.models.admin import Admin
from app.models.artist import Artist

def test_promote_user_to_admin(auth_client, db_session):
    user = User(username="user1", email="user1@example.com", hashed_password="pw", role="user")
    db_session.add(user)
    db_session.commit()

    resp = auth_client.patch(f"/admin/users/{user.id}", json={"role": "admin"})
    assert resp.status_code == 200
    db_session.expire_all()
    db_session.expunge_all()
    user_in_db = db_session.get(User, user.id)
    assert isinstance(user_in_db, Admin)
    assert user_in_db.role == "admin"

def test_promote_user_to_artist(auth_client, db_session):
    user = User(username="user2", email="user2@example.com", hashed_password="pw", role="user")
    db_session.add(user)
    db_session.commit()

    resp = auth_client.patch(f"/admin/users/{user.id}", json={"role": "artist"})
    assert resp.status_code == 200
    db_session.expire_all()
    db_session.expunge_all()
    user_in_db = db_session.get(User, user.id)
    assert isinstance(user_in_db, Artist)
    assert user_in_db.role == "artist"

def test_demote_admin_to_user(auth_client, db_session):
    admin = Admin(username="admin3", email="admin3@example.com", hashed_password="pw", role="admin", name="admin3")
    db_session.add(admin)
    db_session.commit()

    resp = auth_client.patch(f"/admin/users/{admin.id}", json={"role": "user"})
    assert resp.status_code == 200
    db_session.expire_all()
    db_session.expunge_all()
    user_in_db = db_session.get(User, admin.id)
    assert not isinstance(user_in_db, Admin)
    assert not isinstance(user_in_db, Artist)
    assert user_in_db.role == "user"

def test_demote_artist_to_user(auth_client, db_session):
    artist = Artist(username="artist4", email="artist4@example.com", hashed_password="pw", role="artist", name="artist4")
    db_session.add(artist)
    db_session.commit()

    resp = auth_client.patch(f"/admin/users/{artist.id}", json={"role": "user"})
    assert resp.status_code == 200
    db_session.expire_all()
    db_session.expunge_all()
    user_in_db = db_session.get(User, artist.id)
    assert not isinstance(user_in_db, Artist)
    assert user_in_db.role == "user"

def test_artist_to_admin(auth_client, db_session):
    artist = Artist(username="artist5", email="artist5@example.com", hashed_password="pw", role="artist", name="artist5")
    db_session.add(artist)
    db_session.commit()

    resp = auth_client.patch(f"/admin/users/{artist.id}", json={"role": "admin"})
    assert resp.status_code == 200
    db_session.expire_all()
    db_session.expunge_all()
    user_in_db = db_session.get(User, artist.id)
    assert isinstance(user_in_db, Admin)
    assert user_in_db.role == "admin"
