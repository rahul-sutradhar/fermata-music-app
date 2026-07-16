import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure environment variables are set before app settings are loaded
os.environ["DEBUG"] = "False"

from app.core import deps
from app.db.base import Base
from app.main import app
# Import all models to register them with Base.metadata
from app.models import (
    User, Album, Artist, Track, Playlist, PlaylistTrack,
    UserLibrary, PlayerState, RecentlyPlayed, Show, Episode,
    Audiobook, Chapter, RefreshToken
)
from app.core.cache import get_memory_limiter

@pytest.fixture(autouse=True)
def clear_rate_limiter():
    """Clear the in-memory rate limiter before each test to prevent 429s across test files."""
    limiter = get_memory_limiter()
    limiter._store.clear()


TEST_DATABASE_URL = "sqlite://"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


@pytest.fixture(scope="session", autouse=True)
def initialize_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[deps.get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def current_user(db_session):
    user = User(username="tester", email="tester@example.com", hashed_password="hash", role="admin")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def auth_client(client, current_user):
    def override_current_user():
        return current_user

    app.dependency_overrides[deps.get_current_user] = override_current_user
    app.dependency_overrides[deps.get_current_admin] = override_current_user
    app.dependency_overrides[deps.get_current_artist_or_admin] = override_current_user
    yield client
    app.dependency_overrides.pop(deps.get_current_user, None)
    app.dependency_overrides.pop(deps.get_current_admin, None)
    app.dependency_overrides.pop(deps.get_current_artist_or_admin, None)
