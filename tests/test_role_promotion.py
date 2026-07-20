from app.models.user import User
from app.models.admin import Admin
from app.models.artist import Artist

def test_promote_user_to_admin(auth_client, db_session):
    # 1. Create regular user
    regular_user = User(username="myuser", email="myuser@example.com", hashed_password="hashedpassword", role="user")
    db_session.add(regular_user)
    db_session.commit()

    # 2. Make PATCH request to update role of myuser to admin
    response = auth_client.patch(
        f"/admin/users/{regular_user.id}",
        json={"role": "admin"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "admin"

    # Refresh DB session and verify subclass type and table row
    db_session.expire_all()
    db_session.expunge_all()
    user_in_db = db_session.get(User, regular_user.id)
    assert isinstance(user_in_db, Admin)
    assert user_in_db.role == "admin"
    assert user_in_db.name == "myuser"
