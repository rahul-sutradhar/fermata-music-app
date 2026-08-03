import pytest
from unittest.mock import patch, MagicMock
from io import BytesIO
from app.models.artist import Artist
from app.models.album import Album
from app.models.track import Track
from app.models.draft import Draft
from app.models.track_backup import TrackBackup

@pytest.fixture()
def current_user(db_session):
    """Override current_user to be an Artist to match joined table inheritance."""
    user = Artist(
        username="tester_artist",
        email="tester_artist@example.com",
        hashed_password="hash",
        role="artist",
        name="Studio Artist",
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture()
def sample_artist(current_user):
    """The artist profile is the current user itself."""
    return current_user

@pytest.fixture()
def sample_track(db_session, sample_artist):
    """Create a track for the artist."""
    track = Track(title="Existing Track", artist_id=sample_artist.id, duration_seconds=120)
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track

@pytest.fixture()
def sample_draft(db_session, sample_artist):
    """Create a sample draft with the correct Draft model fields."""
    draft = Draft(
        title="Sample Draft",
        artist_id=sample_artist.id,
        audio_file_key="drafts/vocals.webm",
        mix_volumes='{"vocal": 1.0, "music": 0.8}'
    )
    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)
    return draft

def test_save_draft_new(auth_client, sample_artist, db_session):
    """Test saving a new vocal recording draft."""
    file_content = b"fake audio data"
    file_obj = BytesIO(file_content)

    with patch("app.routers.studio.get_b2_client") as mock_b2, \
         patch("app.routers.studio.get_audio_url", return_value="https://example.com/vocals.webm"):
        response = auth_client.post(
            "/studio/drafts",
            data={
                "title": "My New Recording",
                "mix_volumes": '{"vocal": 0.9, "music": 0.7}',
                "is_split": "false"
            },
            files={"file": ("vocal.webm", file_obj, "audio/webm")}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "My New Recording"
        assert data["vocal_url"] == "https://example.com/vocals.webm"
        assert data["mix_volumes"] == {"vocal": 0.9, "music": 0.7}

        # Check database
        db_drafts = db_session.query(Draft).all()
        assert len(db_drafts) == 1
        assert db_drafts[0].title == "My New Recording"

def test_list_drafts(auth_client, sample_draft):
    """Test listing saved drafts for the artist."""
    response = auth_client.get("/studio/drafts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == sample_draft.id
    assert data[0]["title"] == "Sample Draft"

def test_update_draft(auth_client, sample_draft, db_session):
    """Test updating draft volumes and title."""
    response = auth_client.put(
        f"/studio/drafts/{sample_draft.id}",
        data={
            "title": "Updated Draft Name",
            "mix_volumes": '{"vocal": 0.5, "music": 0.5, "bass": 0.5, "drums": 0.5}'
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Draft Name"
    assert data["mix_volumes"]["vocal"] == 0.5

    # Check database
    db_session.refresh(sample_draft)
    assert sample_draft.title == "Updated Draft Name"

def test_delete_draft(auth_client, sample_draft, db_session):
    """Test deleting a draft."""
    with patch("app.routers.studio.delete_audio_file") as mock_delete:
        response = auth_client.delete(f"/studio/drafts/{sample_draft.id}")
        assert response.status_code == 204
        mock_delete.assert_called()

        # Check database
        deleted = db_session.get(Draft, sample_draft.id)
        assert deleted is None

def test_list_backups(auth_client, sample_track, db_session):
    """Test listing tracks that have backups."""
    backup = TrackBackup(track_id=sample_track.id, backup_file_key="backups/track.mp3")
    db_session.add(backup)
    db_session.commit()

    response = auth_client.get("/studio/backups")
    assert response.status_code == 200
    data = response.json()
    assert sample_track.id in data

def test_download_backup(auth_client, sample_track, db_session):
    """Test downloading the raw track backup."""
    backup = TrackBackup(track_id=sample_track.id, backup_file_key="backups/track.mp3")
    db_session.add(backup)
    db_session.commit()

    with patch("app.routers.studio.get_audio_url", return_value="https://example.com/download/backup.mp3"):
        response = auth_client.get(f"/studio/tracks/{sample_track.id}/backup/download?token=dummy_token", follow_redirects=False)
        assert response.status_code == 307
        assert response.headers["location"] == "https://example.com/download/backup.mp3"

def test_publish_draft_vocal_only(auth_client, sample_draft, db_session):
    """Test compiling and publishing a vocal-only draft."""
    # Create target album
    album = Album(title="Test Album", artist_id=sample_draft.artist_id)
    db_session.add(album)
    db_session.commit()

    # Mock download, transcode, index search and mixer compilation
    import tempfile
    import os
    fake_hls_dir = tempfile.mkdtemp()
    with open(os.path.join(fake_hls_dir, "playlist.m3u8"), "w") as f:
        f.write("#EXTM3U")
    with open(os.path.join(fake_hls_dir, "enc.key"), "w") as f:
        f.write("fake-key")

    mock_hls_result = {
        "temp_dir": fake_hls_dir,
        "key_name": "enc.key"
    }

    with patch("app.routers.studio.get_b2_client") as mock_b2, \
         patch("app.routers.studio.transcode_to_hls", return_value=mock_hls_result) as mock_transcode1, \
         patch("app.core.hls.transcode_to_hls", return_value=mock_hls_result) as mock_transcode2, \
         patch("app.routers.studio.upload_local_file", return_value=("backups/1.mp3", "https://example.com/backups/1.mp3")), \
         patch("app.routers.studio.index_and_embed_track"), \
         patch("app.routers.studio.delete_audio_file") as mock_delete, \
         patch("app.routers.studio.subprocess.run") as mock_run:
        
        mock_probe = MagicMock()
        mock_probe.stdout = "120"
        mock_run.return_value = mock_probe

        response = auth_client.post(
            f"/studio/drafts/{sample_draft.id}/publish",
            data={
                "title": "Published Single",
                "album_id": str(album.id),
                "lyrics": "Beautiful vocal lyrics"
            }
        )

        if response.status_code != 200:
            print("PUBLISH_FAIL_BODY:", response.status_code, response.text)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Published Single"
        assert data["lyrics"] == "Beautiful vocal lyrics"

        # Verify draft was deleted
        deleted_draft = db_session.get(Draft, sample_draft.id)
        assert deleted_draft is None

        # Verify track backup was created
        backup = db_session.query(TrackBackup).filter_by(track_id=data["id"]).first()
        assert backup is not None
        assert backup.backup_file_key == f"tracks/{data['id']}/backup/backup.mp3"
