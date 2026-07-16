"""Tests for upload endpoints (presigned URLs and confirmations)."""

import pytest
from unittest.mock import patch, MagicMock

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track


@pytest.fixture()
def sample_album(db_session):
    """Create a test album for track uploads."""
    artist = Artist(name="Test Artist")
    db_session.add(artist)
    db_session.commit()
    db_session.refresh(artist)

    album = Album(title="Test Album", artist_id=artist.id)
    db_session.add(album)
    db_session.commit()
    db_session.refresh(album)
    return album


@pytest.fixture()
def sample_track(db_session, sample_album):
    """Create a test track for audio upload testing."""
    track = Track(title="Test Track", album_id=sample_album.id, duration_seconds=180)
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track



# ===================== ENDPOINT TESTS =====================

def test_presign_returns_url_and_key(client):
    """Presign endpoint should return a valid presigned URL and echo the key."""
    with patch("app.routers.uploads.generate_presigned_put_url", 
               return_value="https://example.backblazeb2.com/presigned-url"):
        response = client.post("/uploads/presign", json={
            "key": "tracks/123/audio.mp3",
            "content_type": "audio/mpeg"
        })

        assert response.status_code == 200
        data = response.json()
        assert data["url"] == "https://example.backblazeb2.com/presigned-url"
        assert data["key"] == "tracks/123/audio.mp3"


def test_presign_with_optional_expires_in(client):
    """Presign endpoint should accept optional expires_in parameter."""
    with patch("app.routers.uploads.generate_presigned_put_url", 
               return_value="https://example.backblazeb2.com/presigned-url"):
        response = client.post("/uploads/presign", json={
            "key": "tracks/456/audio.mp3",
            "content_type": "audio/mpeg",
            "expires_in": 600
        })

        assert response.status_code == 200
        data = response.json()
        assert data["url"] == "https://example.backblazeb2.com/presigned-url"
        assert data["key"] == "tracks/456/audio.mp3"


def test_presign_returns_503_when_storage_unavailable(client):
    """Presign endpoint should return 503 when storage helper fails."""
    with patch("app.routers.uploads.generate_presigned_put_url", return_value=None):
        response = client.post("/uploads/presign", json={
            "key": "tracks/789/audio.mp3",
            "content_type": "audio/mpeg"
        })

        assert response.status_code == 503
        data = response.json()
        assert "Unable to generate presigned URL" in data.get("detail", "")


def test_presign_with_no_content_type(client):
    """Presign endpoint should work without explicit content_type."""
    with patch("app.routers.uploads.generate_presigned_put_url", 
               return_value="https://example.backblazeb2.com/presigned-url"):
        response = client.post("/uploads/presign", json={
            "key": "albums/456/cover.jpg"
        })

        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "key" in data


# ===================== CONFIRM TRACK TESTS =====================

def test_confirm_track_associates_key_with_track(auth_client, db_session, sample_track):
    """Confirm endpoint should associate an object key with a track."""
    with patch("app.services.tracks.get_audio_url", 
               return_value="https://example.backblazeb2.com/signed-get-url"):
        response = auth_client.post("/uploads/confirm-track", json={
            "track_id": sample_track.id,
            "key": "tracks/123/audio-uuid.mp3"
        })

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_track.id
        assert data["audio_url"] == "https://example.backblazeb2.com/signed-get-url"

        # Verify the key was actually saved
        db_session.refresh(sample_track)
        assert sample_track.audio_file_key == "tracks/123/audio-uuid.mp3"


def test_confirm_track_returns_404_for_nonexistent_track(auth_client):
    """Confirm endpoint should return 404 for non-existent track."""
    response = auth_client.post("/uploads/confirm-track", json={
        "track_id": 99999,
        "key": "tracks/123/audio.mp3"
    })

    assert response.status_code == 404


def test_confirm_track_requires_auth(client, sample_track):
    """Confirm endpoint should require authentication."""
    response = client.post("/uploads/confirm-track", json={
        "track_id": sample_track.id,
        "key": "tracks/123/audio.mp3"
    })

    assert response.status_code in [401, 403]


def test_confirm_track_replaces_previous_key(auth_client, db_session, sample_track):
    """Confirm endpoint should replace and delete previous audio key."""
    sample_track.audio_file_key = "tracks/123/old-audio.mp3"
    db_session.commit()

    with patch("app.services.tracks.get_audio_url", 
               return_value="https://example.backblazeb2.com/signed-get-url"), \
         patch("app.services.tracks.delete_audio_file") as mock_delete:
        response = auth_client.post("/uploads/confirm-track", json={
            "track_id": sample_track.id,
            "key": "tracks/123/new-audio.mp3"
        })

        assert response.status_code == 200
        
        # Verify old key was deleted
        mock_delete.assert_called_once_with("tracks/123/old-audio.mp3")
        
        # Verify new key is set
        db_session.refresh(sample_track)
        assert sample_track.audio_file_key == "tracks/123/new-audio.mp3"


# ===================== STORAGE HELPER TESTS =====================

def test_generate_presigned_put_url_returns_valid_url():
    """generate_presigned_put_url should return a presigned URL."""
    from app.core.storage import generate_presigned_put_url
    
    with patch("app.core.storage.get_b2_client") as mock_client:
        mock_s3 = MagicMock()
        mock_client.return_value = mock_s3
        mock_s3.generate_presigned_url.return_value = "https://example.com/presigned"

        url = generate_presigned_put_url("tracks/123/audio.mp3", expires_in=300, content_type="audio/mpeg")

        assert url == "https://example.com/presigned"
        mock_s3.generate_presigned_url.assert_called_once()


def test_generate_presigned_put_url_returns_none_on_config_error():
    """generate_presigned_put_url should return None when storage not configured."""
    from app.core.storage import generate_presigned_put_url

    with patch("app.core.storage.get_b2_client", side_effect=RuntimeError("Not configured")):
        url = generate_presigned_put_url("tracks/123/audio.mp3")

        assert url is None


def test_generate_presigned_put_url_returns_none_on_client_error():
    """generate_presigned_put_url should return None on S3 client errors."""
    from app.core.storage import generate_presigned_put_url, BotoCoreError

    with patch("app.core.storage.get_b2_client") as mock_client:
        mock_s3 = MagicMock()
        mock_client.return_value = mock_s3
        
        # Simulate S3 client error using BotoCoreError (or Exception fallback)
        if BotoCoreError is Exception:
            mock_s3.generate_presigned_url.side_effect = Exception("Access denied")
        else:
            class MockBotoCoreError(BotoCoreError):
                def __init__(self):
                    self.fmt = "Access denied"
            mock_s3.generate_presigned_url.side_effect = MockBotoCoreError()

        url = generate_presigned_put_url("tracks/123/audio.mp3")

        assert url is None


def test_generate_presigned_put_url_includes_content_type():
    """generate_presigned_put_url should pass ContentType to S3 params."""
    from app.core.storage import generate_presigned_put_url

    with patch("app.core.storage.get_b2_client") as mock_client:
        mock_s3 = MagicMock()
        mock_client.return_value = mock_s3
        mock_s3.generate_presigned_url.return_value = "https://example.com/presigned"

        generate_presigned_put_url("tracks/123/audio.mp3", content_type="audio/mpeg")

        call_kwargs = mock_s3.generate_presigned_url.call_args[1]
        assert call_kwargs["Params"]["ContentType"] == "audio/mpeg"


# ===================== INTEGRATION TESTS =====================

def test_full_presigned_upload_workflow(auth_client, client, db_session, sample_track):
    """Test complete workflow: presign → upload → confirm."""
    # Step 1: Request presigned URL (no auth needed)
    with patch("app.routers.uploads.generate_presigned_put_url",
               return_value="https://example.backblazeb2.com/put-url"):
        presign_response = client.post("/uploads/presign", json={
            "key": "tracks/123/audio.mp3",
            "content_type": "audio/mpeg"
        })
        assert presign_response.status_code == 200
        presigned_url = presign_response.json()["url"]

    # Step 2: Client uploads file to presigned URL (simulated)
    # In real scenario, browser would PUT file to presigned_url

    # Step 3: Confirm upload to API (requires auth)
    with patch("app.services.tracks.get_audio_url",
               return_value="https://example.backblazeb2.com/signed-get"):
        confirm_response = auth_client.post("/uploads/confirm-track", json={
            "track_id": sample_track.id,
            "key": "tracks/123/audio.mp3"
        })
        assert confirm_response.status_code == 200

        # Verify track now has audio URL
        data = confirm_response.json()
        assert data["audio_url"] == "https://example.backblazeb2.com/signed-get"


def test_presign_and_confirm_with_different_content_types(auth_client, client, db_session, sample_track):
    """Test presigned upload workflow with various content types."""
    test_cases = [
        ("tracks/123/audio.mp3", "audio/mpeg"),
        ("albums/456/cover.jpg", "image/jpeg"),
        ("albums/789/cover.png", "image/png"),
    ]

    for key, content_type in test_cases:
        with patch("app.routers.uploads.generate_presigned_put_url",
                   return_value=f"https://example.backblazeb2.com/{key}"):
            presign_response = client.post("/uploads/presign", json={
                "key": key,
                "content_type": content_type
            })
            assert presign_response.status_code == 200
            assert presign_response.json()["key"] == key

