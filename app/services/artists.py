from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.artist import Artist
from app.models.album import Album
from app.schemas.album import AlbumResponse
from app.schemas.artist import ArtistResponse


def _to_artist_response(artist: Artist) -> ArtistResponse:
    return ArtistResponse(id=artist.id, name=artist.name, user_id=artist.user_id)


def _to_album_response(album: Album) -> AlbumResponse:
    return AlbumResponse(
        id=album.id,
        title=album.title,
        artist_id=album.artist_id,
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
    query = select(Album).where(Album.artist_id == artist_id).order_by(Album.id)
    albums = db.scalars(query.offset(skip).limit(limit)).all()
    return [_to_album_response(album) for album in albums]


def create_artist(*, db: Session, name: str, user_id: int | None = None) -> ArtistResponse:
    artist = Artist(name=name, user_id=user_id)
    db.add(artist)
    db.commit()
    db.refresh(artist)
    return _to_artist_response(artist)


def update_artist(*, db: Session, artist_id: int, name: str | None = None, user_id: int | None = None) -> ArtistResponse:
    artist = _get_artist_or_404(db, artist_id)
    if name is not None:
        artist.name = name
    if user_id is not None:
        artist.user_id = user_id
    db.commit()
    db.refresh(artist)
    return _to_artist_response(artist)


def delete_artist(*, db: Session, artist_id: int) -> None:
    artist = _get_artist_or_404(db, artist_id)
    db.delete(artist)
    db.commit()
