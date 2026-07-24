import pytest
from unittest.mock import patch

from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track


@pytest.fixture()
def sample_album(db_session):
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
    track = Track(title="Test Track", album_id=sample_album.id, duration_seconds=180)
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track


def test_upload_track_audio_returns_signed_url(auth_client, sample_track):
    import os, tempfile
    fake_hls_dir = tempfile.mkdtemp()
    # Create stub HLS files in the temp dir
    open(os.path.join(fake_hls_dir, "playlist.m3u8"), "wb").close()
    open(os.path.join(fake_hls_dir, "enc.key"), "wb").close()
    open(os.path.join(fake_hls_dir, "segment_000.ts"), "wb").close()

    hls_result = {"temp_dir": fake_hls_dir, "playlist_name": "playlist.m3u8", "key_name": "enc.key", "key_bytes": b"\x00" * 16}

    with patch("app.core.hls.transcode_to_hls", return_value=hls_result), \
         patch("app.core.storage.upload_local_file", return_value="ok"), \
         patch("app.services.tracks.upload_audio_file", return_value="tracks/1/test.mp3"), \
         patch("app.services.tracks.get_audio_url", return_value="https://cdn.example.com/tracks/1/hls/playlist.m3u8"):
        response = auth_client.post(
            f"/tracks/{sample_track.id}/audio",
            files={"file": ("test.mp3", b"dummy audio data", "audio/mpeg")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_track.id
        # HLS playlist URL takes priority over raw audio
        assert "playlist.m3u8" in data["audio_url"]


def test_get_track_audio_url_returns_signed_url(auth_client, db_session, sample_track):
    sample_track.audio_file_key = "tracks/1/test.mp3"
    db_session.commit()

    with patch("app.services.tracks.get_audio_url", return_value="https://example.com/tracks/1/test.mp3"):
        response = auth_client.get(f"/tracks/{sample_track.id}/audio")

        assert response.status_code == 200
        assert response.json()["audio_url"] == "https://example.com/tracks/1/test.mp3"


def test_upload_track_audio_rejects_non_audio(auth_client, sample_track):
    response = auth_client.post(
        f"/tracks/{sample_track.id}/audio",
        files={"file": ("test.txt", b"not audio data", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file must be an audio file"


def test_upload_track_audio_service_unavailable(auth_client, sample_track):
    import os, tempfile
    fake_hls_dir = tempfile.mkdtemp()
    open(os.path.join(fake_hls_dir, "playlist.m3u8"), "wb").close()
    open(os.path.join(fake_hls_dir, "enc.key"), "wb").close()

    hls_result = {"temp_dir": fake_hls_dir, "playlist_name": "playlist.m3u8", "key_name": "enc.key", "key_bytes": b"\x00" * 16}

    with patch("app.core.hls.transcode_to_hls", return_value=hls_result), \
         patch("app.core.storage.upload_local_file", side_effect=RuntimeError("B2 unavailable")):
        response = auth_client.post(
            f"/tracks/{sample_track.id}/audio",
            files={"file": ("test.mp3", b"dummy audio data", "audio/mpeg")},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "Storage service is unavailable"


def test_delete_track_cleans_up_audio(auth_client, db_session, sample_track):
    sample_track.audio_file_key = "tracks/1/old.mp3"
    db_session.commit()

    with patch("app.services.tracks.delete_audio_file") as mock_delete:
        response = auth_client.delete(f"/tracks/{sample_track.id}")

    assert response.status_code == 204
    mock_delete.assert_called_once_with("tracks/1/old.mp3")


def test_play_track_audio_redirects_to_signed_url(auth_client, db_session, sample_track):
    sample_track.audio_file_key = "tracks/1/test.mp3"
    db_session.commit()

    with patch("app.services.tracks.get_audio_url", return_value="https://example.com/tracks/1/test.mp3"):
        response = auth_client.get(f"/tracks/{sample_track.id}/audio/play", follow_redirects=False)

        assert response.status_code == 307
        assert response.headers["location"] == "https://example.com/tracks/1/test.mp3"


def test_get_audio_url_with_cdn_url():
    from app.core.config import settings
    from app.core.storage import get_audio_url
    
    original_cdn_url = settings.cdn_url
    try:
        settings.cdn_url = "https://cdn.fermata.example.com"
        url = get_audio_url("tracks/1/test.mp3")
        assert url == "https://cdn.fermata.example.com/tracks/1/test.mp3"
        
        # Test leading/trailing slash handling
        settings.cdn_url = "https://cdn.fermata.example.com/"
        url = get_audio_url("/tracks/1/test.mp3")
        assert url == "https://cdn.fermata.example.com/tracks/1/test.mp3"
    finally:
        settings.cdn_url = original_cdn_url


def test_get_track_hls_key_success(auth_client, db_session, sample_track):
    sample_track.hls_key_key = "tracks/1/hls/encryption.key"
    db_session.commit()

    with patch("app.routers.tracks.get_b2_client") as mock_b2_client:
        import io
        mock_body = io.BytesIO(b"16byteaeskeydata")
        mock_b2_client.return_value.get_object.return_value = {"Body": mock_body}

        response = auth_client.get(f"/tracks/{sample_track.id}/key")

        assert response.status_code == 200
        assert response.content == b"16byteaeskeydata"


def test_get_track_hls_key_unauthorized(client, db_session, sample_track):
    sample_track.hls_key_key = "tracks/1/hls/encryption.key"
    db_session.commit()

    # Request without token
    response = client.get(f"/tracks/{sample_track.id}/key")
    assert response.status_code == 401


def test_get_track_hls_key_not_found(auth_client, db_session, sample_track):
    # No hls_key_key set on track
    response = auth_client.get(f"/tracks/{sample_track.id}/key")
    assert response.status_code == 404
