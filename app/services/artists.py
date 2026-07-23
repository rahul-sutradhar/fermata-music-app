from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.artist import Artist
from app.models.album import Album
from app.schemas.album import AlbumResponse
from app.schemas.artist import ArtistResponse


def _to_artist_response(artist: Artist) -> ArtistResponse:

    return ArtistResponse(id=artist.id, name=artist.name, user_id=artist.id)


def _to_album_response(album: Album) -> AlbumResponse:
    return AlbumResponse(
        id=album.id,
        title=album.title,
        artist_id=album.artist_id,
        artist_name=album.artist_name,
    )


def _get_artist_or_404(db: Session, artist_id: int) -> Artist:
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artist {artist_id} not found",
        )
    return artist


def get_artist(*, db: Session, artist_id: int) -> ArtistResponse:
    return _to_artist_response(_get_artist_or_404(db, artist_id))


def list_artist_albums(
    *, db: Session, artist_id: int, skip: int = 0, limit: int = 100
) -> list[AlbumResponse]:
    _get_artist_or_404(db, artist_id)
    query = select(Album).options(joinedload(Album.artist)).where(Album.artist_id == artist_id).order_by(Album.id)
    albums = db.scalars(query.offset(skip).limit(limit)).all()
    return [_to_album_response(album) for album in albums]



def create_artist(*, db: Session, name: str, user_id: int | None = None) -> ArtistResponse:
    from app.models.user import User
    if user_id is not None:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found",
            )
        if user.role != "admin":
            user.role = "artist"
        db.commit()
        
        # Direct insert into the artists subclass table
        from sqlalchemy import text
        db.execute(
            text("INSERT INTO artists (id, name) VALUES (:id, :name)"),
            {"id": user_id, "name": name}
        )
        db.commit()
        artist = db.get(Artist, user_id)
    else:
        # Create user account and artist JTI profile in one construct
        import uuid
        from app.core.oauth import hash_password
        username = f"artist_{uuid.uuid4().hex[:8]}"
        email = f"{username}@fermata.com"
        hashed_password = hash_password(uuid.uuid4().hex)
        
        artist = Artist(
            username=username,
            email=email,
            hashed_password=hashed_password,
            role="artist",
            name=name
        )
        db.add(artist)
        db.commit()
        db.refresh(artist)
        
    return _to_artist_response(artist)


def update_artist(*, db: Session, artist_id: int, name: str | None = None, user_id: int | None = None) -> ArtistResponse:
    from app.models.user import User
    artist = _get_artist_or_404(db, artist_id)
    if name is not None:
        artist.name = name
        
    if user_id is not None and user_id != artist.id:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found",
            )
        if user.role != "admin":
            user.role = "artist"
        db.commit()
        
        # Move profile to new user_id JTI row
        from sqlalchemy import text
        db.execute(text("DELETE FROM artists WHERE id = :id"), {"id": artist_id})
        db.execute(
            text("INSERT INTO artists (id, name) VALUES (:id, :name)"),
            {"id": user_id, "name": artist.name if name is None else name}
        )
        db.commit()
        artist = db.get(Artist, user_id)
    else:
        db.commit()
        db.refresh(artist)
        
    return _to_artist_response(artist)


def delete_artist(*, db: Session, artist_id: int) -> None:
    artist = _get_artist_or_404(db, artist_id)
    db.delete(artist)
    db.commit()
