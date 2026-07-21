from pathlib import Path
from fastapi import HTTPException, status, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.storage import get_audio_url
from app.models.album import Album
from app.models.track import Track
from app.models.user import User
from app.schemas.album import AlbumResponse
from app.schemas.track import TrackResponse


def _to_album_response(album: Album) -> AlbumResponse:
    return AlbumResponse(
        id=album.id,
        title=album.title,
        artist_id=album.artist_id,
        artist_name=album.artist_name,
        cover_url=album.cover_url,
    )


def _to_track_response(track: Track) -> TrackResponse:
    return TrackResponse(
        id=track.id,
        title=track.title,
        album_id=track.album_id,
        duration_seconds=track.duration_seconds,
        audio_url=get_audio_url(track.audio_file_key) if track.audio_file_key else None,
        cover_url=track.cover_url,
        album_title=track.album_title,
        artist_id=track.artist_id,
        artist_name=track.artist_name,
    )


def _get_album_or_404(db: Session, album_id: int) -> Album:
    album = db.get(Album, album_id)
    if album is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Album {album_id} not found",
        )
    return album


def list_albums(*, db: Session, skip: int = 0, limit: int = 100) -> list[AlbumResponse]:
    query = select(Album).options(joinedload(Album.artist)).order_by(Album.id)
    albums = db.scalars(query.offset(skip).limit(limit)).all()
    return [_to_album_response(album) for album in albums]


def get_album(*, db: Session, album_id: int) -> AlbumResponse:
    return _to_album_response(_get_album_or_404(db, album_id))


def list_album_tracks(
    *, db: Session, album_id: int, skip: int = 0, limit: int = 100
) -> list[TrackResponse]:
    _get_album_or_404(db, album_id)
    query = (
        select(Track)
        .options(joinedload(Track.album).joinedload(Album.artist))
        .where(Track.album_id == album_id)
        .order_by(Track.id)
    )
    tracks = db.scalars(query.offset(skip).limit(limit)).all()
    return [_to_track_response(track) for track in tracks]


def create_album(*, db: Session, title: str, artist_id: int) -> AlbumResponse:
    # Ensure artist exists
    from app.services.artists import _get_artist_or_404
    _get_artist_or_404(db, artist_id)
    album = Album(title=title, artist_id=artist_id)
    db.add(album)
    db.commit()
    db.refresh(album)
    return _to_album_response(album)


def update_album(*, db: Session, album_id: int, title: str | None = None, artist_id: int | None = None) -> AlbumResponse:
    album = _get_album_or_404(db, album_id)
    if title is not None:
        album.title = title
    if artist_id is not None:
        from app.services.artists import _get_artist_or_404
        _get_artist_or_404(db, artist_id)
        album.artist_id = artist_id
    db.commit()
    db.refresh(album)
    return _to_album_response(album)


def delete_album(*, db: Session, album_id: int) -> None:
    album = _get_album_or_404(db, album_id)
    db.delete(album)
    db.commit()


def upload_album_cover(
    *,
    db: Session,
    album_id: int,
    file: UploadFile,
    user: User,
) -> AlbumResponse:
    album = _get_album_or_404(db, album_id)
    if user.role != "admin":
        from app.services.artists import _get_artist_or_404
        artist = _get_artist_or_404(db, album.artist_id)
        if artist.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    if file.content_type is None or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be an image file",
        )

    suffix = Path(file.filename or "").suffix or ".png"
    object_key = f"albums/{album.id}/cover{suffix}"

    from app.core.storage import upload_audio_file, delete_audio_file
    try:
        upload_audio_file(file=file, object_key=object_key)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service is unavailable",
        ) from exc

    previous_key = album.cover_image_key
    album.cover_image_key = object_key
    db.commit()
    db.refresh(album)

    if previous_key and previous_key != object_key:
        try:
            delete_audio_file(previous_key)
        except RuntimeError:
            pass

    return _to_album_response(album)


