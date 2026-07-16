from app.models.artist import Artist
from app.models.album import Album
from app.models.track import Track


def test_search_returns_matching_results(client, db_session):
    artist = Artist(name="Sample Artist")
    db_session.add(artist)
    db_session.flush()

    album = Album(title="Greatest Hits", artist_id=artist.id)
    db_session.add(album)
    db_session.flush()

    track = Track(title="My Favorite Song", album_id=album.id, duration_seconds=200)
    other = Track(title="Another Tune", album_id=album.id, duration_seconds=180)
    db_session.add_all([track, other])
    db_session.commit()

    response = client.get("/search", params={"q": "Favorite", "limit": 10})
    assert response.status_code == 200
    data = response.json()
    assert data["q"] == "Favorite"
    # should include at least one track result
    titles = [r["title"] for r in data["results"]]
    assert "My Favorite Song" in titles


def test_search_artist_and_album(client, db_session):
    artist = Artist(name="Unique Artist")
    db_session.add(artist)
    db_session.flush()

    album = Album(title="Unique Album", artist_id=artist.id)
    db_session.add(album)
    db_session.commit()

    resp = client.get("/search", params={"q": "Unique", "limit": 10})
    assert resp.status_code == 200
    results = resp.json()["results"]
    types = {r["type"] for r in results}
    assert "artist" in types or "album" in types


def test_search_no_results(client, db_session):
    response = client.get("/search", params={"q": "NoSuchThing", "limit": 10})
    assert response.status_code == 200
    data = response.json()
    assert data["results"] == []
