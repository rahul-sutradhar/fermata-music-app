"""Seed the local database with sample data for development."""

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.album import Album
from app.models.artist import Artist
from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track
from app.models.user import User

SEED_TRACKS = [
    ("Bohemian Rhapsody", 354),
    ("Stairway to Heaven", 482),
    ("Hotel California", 391),
]

SEED_ALBUMS = [
    ("A Night at the Opera", "Queen"),
    ("Led Zeppelin IV", "Led Zeppelin"),
    ("Hotel California", "Eagles"),
]


from app.core.oauth import hash_password

def seed() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(User.id).limit(1)) is not None:
            print("Database already seeded — skipping.")
            return

        # Create Admin
        from app.models.admin import Admin
        admin = Admin(
            username="admin",
            email="admin@fermata.com",
            hashed_password=hash_password("admin123"),
            role="admin",
            name="Admin",
        )
        db.add(admin)

        # Create normal user
        user = User(
            username="dev-user",
            email="dev@fermata.com",
            hashed_password=hash_password("password"),
            role="user",
        )
        db.add(user)
        db.flush()

        artists: dict[str, Artist] = {}
        for _, artist_name in SEED_ALBUMS:
            if artist_name not in artists:
                if artist_name == "Queen":
                    artist = Artist(
                        username="queen",
                        email="queen@fermata.com",
                        hashed_password=hash_password("password"),
                        role="artist",
                        name="Queen"
                    )
                else:
                    import uuid
                    username = f"artist_{uuid.uuid4().hex[:8]}"
                    artist = Artist(
                        username=username,
                        email=f"{username}@fermata.com",
                        hashed_password=hash_password(uuid.uuid4().hex),
                        role="artist",
                        name=artist_name
                    )
                db.add(artist)
                artists[artist_name] = artist

        db.flush()

        albums: list[Album] = []
        for title, artist_name in SEED_ALBUMS:
            album = Album(title=title, artist_id=artists[artist_name].id)
            db.add(album)
            albums.append(album)

        db.flush()

        tracks: list[Track] = []
        for album, (title, duration) in zip(albums, SEED_TRACKS, strict=True):
            track = Track(title=title, album_id=album.id, duration_seconds=duration)
            db.add(track)
            tracks.append(track)

        db.flush()

        playlist = Playlist(name="My Favourites", user_id=user.id)
        db.add(playlist)
        db.flush()

        for position, track in enumerate(tracks, start=1):
            db.add(
                PlaylistTrack(
                    playlist_id=playlist.id,
                    track_id=track.id,
                    position=position,
                )
            )

        db.commit()
        print("Database seeded successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
