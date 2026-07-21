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


def test_get_artist_singles(client, db_session):
    artist, _, _ = seed_album_data(db_session)
    single_track = Track(title="Standalone Single", album_id=None, artist_id=artist.id, duration_seconds=195)
    db_session.add(single_track)
    db_session.commit()

    response = client.get(f"/artists/{artist.id}/singles")

    assert response.status_code == 200
    singles = response.json()
    assert len(singles) == 1
    assert singles[0]["title"] == "Standalone Single"
    assert singles[0]["album_id"] is None
    assert singles[0]["artist_id"] == artist.id


def test_delete_playlist(auth_client, db_session):
    from app.models.playlist import Playlist
    playlist = Playlist(name="Test Playlist to Delete", user_id=1)
    db_session.add(playlist)
    db_session.commit()

    response = auth_client.delete(f"/playlists/{playlist.id}")
    assert response.status_code == 204

    deleted = db_session.get(Playlist, playlist.id)
    assert deleted is None


def test_list_tracks_filter_by_artist(client, db_session):
    artist, album, tracks = seed_album_data(db_session)
    
    # Create another artist and track
    other_artist = Artist(name="Other Artist")
    db_session.add(other_artist)
    db_session.flush()
    other_album = Album(title="Other Album", artist_id=other_artist.id)
    db_session.add(other_album)
    db_session.flush()
    other_track = Track(title="Other Track", album_id=other_album.id, duration_seconds=150)
    db_session.add(other_track)
    db_session.commit()

    # Filter tracks by first artist (should return their 2 tracks)
    response = client.get(f"/tracks?artist_id={artist.id}")
    assert response.status_code == 200
    res_tracks = response.json()
    assert len(res_tracks) == 2
    assert all(t["artist_id"] == artist.id for t in res_tracks)

    # Filter tracks by second artist (should return 1 track)
    response = client.get(f"/tracks?artist_id={other_artist.id}")
    assert response.status_code == 200
    res_tracks = response.json()
    assert len(res_tracks) == 1
    assert res_tracks[0]["title"] == "Other Track"



