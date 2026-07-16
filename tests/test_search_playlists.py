from app.models.album import Album
from app.models.artist import Artist
from app.models.playlist import Playlist
from app.models.track import Track


def seed_music_data(db):
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
    db.refresh(track_b)
    return artist, album, [track_a, track_b]


def test_search_returns_matching_entities(client, db_session):
    artist, album, tracks = seed_music_data(db_session)

    response = client.get("/search", params={"q": "Test", "limit": 10})

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["tracks"]) == 2
    assert payload["albums"][0]["title"] == album.title
    assert payload["artists"][0]["name"] == artist.name


def test_me_playlists_returns_owned_playlists(auth_client, db_session, current_user):
    playlist = Playlist(name="Favorites", user_id=current_user.id)
    db_session.add(playlist)
    db_session.commit()
    db_session.refresh(playlist)

    response = auth_client.get("/me/playlists")

    assert response.status_code == 200
    assert response.json() == [
        {"id": playlist.id, "name": "Favorites", "user_id": current_user.id}
    ]


def test_create_playlist(auth_client):
    response = auth_client.post("/me/playlists", json={"name": "Road Trip"})

    assert response.status_code == 201
    assert response.json()["name"] == "Road Trip"


def test_playlist_items_crud(auth_client, db_session, current_user):
    _, album, tracks = seed_music_data(db_session)
    playlist = Playlist(name="Queue", user_id=current_user.id)
    db_session.add(playlist)
    db_session.commit()
    db_session.refresh(playlist)

    add_response = auth_client.post(
        f"/playlists/{playlist.id}/items",
        json={"track_id": tracks[0].id, "position": 1},
    )
    assert add_response.status_code == 201
    assert add_response.json()["position"] == 1

    list_response = auth_client.get(f"/playlists/{playlist.id}/items")
    assert list_response.status_code == 200
    assert list_response.json()[0]["track"]["title"] == tracks[0].title

    second_add = auth_client.post(
        f"/playlists/{playlist.id}/items",
        json={"track_id": tracks[1].id, "position": 1},
    )
    assert second_add.status_code == 201
    assert second_add.json()["position"] == 1

    reorder_response = auth_client.patch(
        f"/playlists/{playlist.id}/items/{tracks[0].id}",
        json={"position": 2},
    )
    assert reorder_response.status_code == 200
    assert reorder_response.json()["position"] == 2

    delete_response = auth_client.delete(f"/playlists/{playlist.id}/items/{tracks[1].id}")
    assert delete_response.status_code == 204


def test_playlist_cover_upload(auth_client, db_session, current_user):
    playlist = Playlist(name="Artwork", user_id=current_user.id)
    db_session.add(playlist)
    db_session.commit()
    db_session.refresh(playlist)

    response = auth_client.post(
        f"/playlists/{playlist.id}/cover",
        files={"cover_file": ("cover.jpg", b"fake-image-bytes", "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["filename"].startswith(f"playlist-{playlist.id}")
