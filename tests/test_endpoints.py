from app.models.album import Album
from app.models.artist import Artist
from app.models.track import Track


def seed_album_data(db):
    artist = Artist(name="Test Artist")
    db.add(artist)
    db.flush()

    album = Album(title="Test Album", artist_id=artist.id)
    db.add(album)
    db.flush()

    track_a = Track(title="First Track", album_id=album.id, duration_seconds=210)
    track_b = Track(title="Second Track", album_id=album.id, duration_seconds=185)
    db.add_all([track_a, track_b])
    db.commit()
    db.refresh(artist)
    db.refresh(album)
    db.refresh(track_a)
    return artist, album, [track_a, track_b]


def test_get_album_by_id(client, db_session):
    artist, album, _ = seed_album_data(db_session)

    response = client.get(f"/albums/{album.id}")

    assert response.status_code == 200
    assert response.json() == {
        "id": album.id,
        "title": album.title,
        "artist_id": album.artist_id,
        "artist_name": artist.name,
        "cover_url": None,
    }


def test_get_album_tracks(client, db_session):
    _, album, tracks = seed_album_data(db_session)

    response = client.get(f"/albums/{album.id}/tracks")

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert response.json()[0]["title"] == "First Track"
    assert response.json()[1]["title"] == "Second Track"


def test_get_artist_by_id(client, db_session):
    artist, _, _ = seed_album_data(db_session)

    response = client.get(f"/artists/{artist.id}")

    assert response.status_code == 200
    assert response.json() == {"id": artist.id, "name": artist.name, "user_id": artist.id}


def test_get_artist_albums(client, db_session):
    artist, album, _ = seed_album_data(db_session)

    response = client.get(f"/artists/{artist.id}/albums")

    assert response.status_code == 200
    assert response.json() == [
        {"id": album.id, "title": album.title, "artist_id": artist.id, "artist_name": artist.name, "cover_url": None}
    ]




def test_get_track_by_id(client, db_session):
    _, album, tracks = seed_album_data(db_session)
    track = tracks[0]

    response = client.get(f"/tracks/{track.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == track.id
    assert data["title"] == track.title
    assert data["album_id"] == track.album_id
    assert data["duration_seconds"] == track.duration_seconds
    assert data["audio_url"] == None


def test_get_missing_album_returns_404(client):
    response = client.get("/albums/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Album 999 not found"


def test_get_missing_artist_returns_404(client):
    response = client.get("/artists/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Artist 999 not found"


def test_get_missing_track_returns_404(client):
    response = client.get("/tracks/999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Track 999 not found"
