import pytest
from app.core.config import settings

@pytest.fixture(autouse=True)
def configure_health_token(monkeypatch):
    monkeypatch.setattr(settings, "health_check_token", "test-secret-token")

def test_health_check_no_token(client):
    response = client.get("/health")
    assert response.status_code == 403
    assert response.json() == {"detail": "Not authorized"}

def test_health_check_invalid_token(client):
    response = client.get("/health?token=wrongtoken")
    assert response.status_code == 403
    assert response.json() == {"detail": "Not authorized"}

def test_health_check_valid_token(client):
    response = client.get("/health?token=test-secret-token")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_health_check_unconfigured(client, monkeypatch):
    # Set to None to simulate unconfigured token
    monkeypatch.setattr(settings, "health_check_token", None)
    
    response = client.get("/health?token=anytoken")
    assert response.status_code == 500
    assert response.json() == {"detail": "Health check token is not configured on the server."}
