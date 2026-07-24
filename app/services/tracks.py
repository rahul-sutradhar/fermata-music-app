from fastapi import HTTPException, status, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload
from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.core.storage import delete_audio_file, get_audio_url, upload_audio_file
from app.models.album import Album
from app.models.track import Track
from app.schemas.track import TrackCreate, TrackResponse, TrackUpdate

_RESTRICTED_ALBUM_IDS = {999}


from app.models.artist import Artist

def _to_response(track: Track) -> TrackResponse:
    # Prioritize HLS playlist URL, fallback to raw audio
    audio_key = track.hls_playlist_key if track.hls_playlist_key else track.audio_file_key
    return TrackResponse(
        id=track.id,
        title=track.title,
        album_id=track.album_id,
        duration_seconds=track.duration_seconds,
        audio_url=get_audio_url(audio_key) if audio_key else None,
        cover_url=track.cover_url,
        album_title=track.album_title,
        artist_id=track.effective_artist_id,
        artist_name=track.artist_name,
        lyrics=track.lyrics,
    )


def _get_track_or_404(db: Session, track_id: int) -> Track:
    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found",
        )
    return track


from app.models.user import User


def _ensure_can_write_to_track_target(
    db: Session, *, album_id: int | None, artist_id: int | None, user: User
) -> None:
    if user.role == "admin":
        return

    if album_id is not None:
        album = db.get(Album, album_id)
        if album is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Album {album_id} not found",
            )
        if album_id in _RESTRICTED_ALBUM_IDS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to modify tracks on this album",
            )
        from app.services.artists import _get_artist_or_404
        artist = _get_artist_or_404(db, album.artist_id)
        if artist.id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    elif artist_id is not None:
        from app.services.artists import _get_artist_or_404
        artist = _get_artist_or_404(db, artist_id)
        if artist.id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either album_id or artist_id must be provided",
        )


def _ensure_can_write_to_album(db: Session, album_id: int | None, user: User) -> None:
    if album_id is None:
        if user.role == "admin":
            return
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Album ID required for this action",
        )
    _ensure_can_write_to_track_target(db, album_id=album_id, artist_id=None, user=user)


def _ensure_can_write_to_track(db: Session, track: Track, user: User) -> None:
    _ensure_can_write_to_track_target(
        db, album_id=track.album_id, artist_id=track.effective_artist_id, user=user
    )


def _ensure_unique_title(
    db: Session, title: str, *, exclude_id: int | None = None
) -> None:
    query = select(Track.id).where(func.lower(Track.title) == title.lower())
    if exclude_id is not None:
        query = query.where(Track.id != exclude_id)

    if db.scalar(query.limit(1)) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A track with this title already exists",
        )


def list_tracks(*, db: Session, skip: int, limit: int, q: str | None) -> list[TrackResponse]:
    query = (
        select(Track)
        .options(
            joinedload(Track.album).joinedload(Album.artist),
            joinedload(Track.artist_rel),
        )
        .order_by(Track.id)
    )
    if q:
        query = query.where(Track.title.ilike(f"%{q}%"))

    tracks = db.scalars(query.offset(skip).limit(limit)).all()
    return [_to_response(track) for track in tracks]


def get_track(*, db: Session, track_id: int) -> TrackResponse:
    return _to_response(_get_track_or_404(db, track_id))


def upload_track_audio(
    *,
    db: Session,
    track_id: int,
    file: UploadFile,
    user: User,
) -> TrackResponse:
    track = _get_track_or_404(db, track_id)
    _ensure_can_write_to_track(db, track, user)

    if file.content_type is None or not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be an audio file",
        )

    original_position = None
    size = None
    try:
        original_position = file.file.tell()
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(original_position or 0)
    except Exception:
        size = None

    if size is not None and size > settings.audio_upload_max_bytes:
        max_mb = settings.audio_upload_max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Audio file must be smaller than {max_mb} MB",
        )

    # 1. Save uploaded file to a temporary file on disk
    import tempfile
    import os
    import shutil
    from app.core.hls import transcode_to_hls
    from app.core.storage import upload_local_file

    suffix = Path(file.filename or "audio.bin").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_raw:
        shutil.copyfileobj(file.file, temp_raw)
        temp_raw_path = temp_raw.name

    # 2. Transcode to HLS
    try:
        hls_result = transcode_to_hls(temp_raw_path, track.id)
        temp_hls_dir = hls_result["temp_dir"]
    except Exception as exc:
        try:
            os.remove(temp_raw_path)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to transcode audio file: {str(exc)}"
        )

    # 3. Upload generated HLS files to B2
    hls_playlist_key = f"tracks/{track.id}/hls/playlist.m3u8"
    hls_key_key = f"tracks/{track.id}/hls/encryption.key"

    try:
        for fname in os.listdir(temp_hls_dir):
            fpath = os.path.join(temp_hls_dir, fname)
            if os.path.isdir(fpath):
                continue

            if fname == "playlist.m3u8":
                b2_key = hls_playlist_key
                content_type = "application/x-mpegURL"
            elif fname == "enc.key":
                b2_key = hls_key_key
                content_type = "application/octet-stream"
            elif fname.endswith(".ts"):
                b2_key = f"tracks/{track.id}/hls/{fname}"
                content_type = "video/MP2T"
            else:
                continue

            upload_local_file(local_path=fpath, object_key=b2_key, content_type=content_type)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service is unavailable",
        ) from exc
    finally:
        # Clean up temp files
        try:
            shutil.rmtree(temp_hls_dir)
            os.remove(temp_raw_path)
        except Exception:
            pass

    # 4. Save raw audio for fallback compatibility
    extension = Path(file.filename).suffix or ".bin"
    object_key = f"tracks/{track.id}/audio{extension}"
    try:
        file.file.seek(0)
        upload_audio_file(file=file, object_key=object_key)
    except Exception:
        # Fallback raw upload failure is tolerated as long as HLS succeeded
        pass

    previous_key = track.audio_file_key
    track.audio_file_key = object_key
    track.hls_playlist_key = hls_playlist_key
    track.hls_key_key = hls_key_key
    db.commit()
    db.refresh(track)

    if previous_key and previous_key != object_key:
        try:
            delete_audio_file(previous_key)
        except RuntimeError:
            pass

    return _to_response(track)


def get_track_audio_url(*, db: Session, track_id: int) -> str:
    track = _get_track_or_404(db, track_id)
    # Prioritize HLS playlist URL
    if track.hls_playlist_key:
        url = get_audio_url(track.hls_playlist_key)
        if url:
            return url

    # Fallback to raw audio
    if track.audio_file_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio not uploaded for this track",
        )
    url = get_audio_url(track.audio_file_key)
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio storage is not configured or temporarily unavailable",
        )
    return url


def create_track(*, db: Session, payload: TrackCreate, user: User) -> TrackResponse:
    _ensure_can_write_to_track_target(
        db, album_id=payload.album_id, artist_id=payload.artist_id, user=user
    )
    _ensure_unique_title(db, payload.title)

    data = payload.model_dump()
    if payload.album_id:
        album = db.get(Album, payload.album_id)
        if album:
            data["artist_id"] = album.artist_id

    track = Track(**data)
    db.add(track)
    db.commit()
    db.refresh(track)
    return _to_response(track)


def update_track(
    *, db: Session, track_id: int, payload: TrackUpdate, user: User
) -> TrackResponse:
    track = _get_track_or_404(db, track_id)
    _ensure_can_write_to_track(db, track, user)

    updates = payload.model_dump(exclude_unset=True)

    new_album_id = updates.get("album_id", track.album_id)
    new_artist_id = updates.get("artist_id", track.effective_artist_id)

    if "album_id" in updates or "artist_id" in updates:
        _ensure_can_write_to_track_target(
            db, album_id=new_album_id, artist_id=new_artist_id, user=user
        )
        if new_album_id is not None:
            album = db.get(Album, new_album_id)
            if album:
                updates["artist_id"] = album.artist_id
        else:
            if "artist_id" not in updates and track.effective_artist_id:
                updates["artist_id"] = track.effective_artist_id

    if "title" in updates:
        _ensure_unique_title(db, updates["title"], exclude_id=track_id)

    for field, value in updates.items():
        setattr(track, field, value)

    db.commit()
    db.refresh(track)
    return _to_response(track)


def delete_track(*, db: Session, track_id: int, user: User) -> None:
    track = _get_track_or_404(db, track_id)
    _ensure_can_write_to_track(db, track, user)
    if track.audio_file_key:
        try:
            delete_audio_file(track.audio_file_key)
        except RuntimeError:
            pass
    db.delete(track)
    db.commit()


def set_track_audio_key(*, db: Session, track_id: int, object_key: str, user: User) -> TrackResponse:
    track = _get_track_or_404(db, track_id)
    _ensure_can_write_to_track(db, track, user)

    previous_key = track.audio_file_key
    track.audio_file_key = object_key
    db.commit()
    db.refresh(track)

    if previous_key and previous_key != object_key:
        try:
            delete_audio_file(previous_key)
        except RuntimeError:
            pass

    return _to_response(track)


def upload_track_cover(
    *,
    db: Session,
    track_id: int,
    file: UploadFile,
    user: User,
) -> TrackResponse:
    track = _get_track_or_404(db, track_id)
    _ensure_can_write_to_track(db, track, user)

    if file.content_type is None or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be an image file",
        )

    extension = Path(file.filename or "").suffix or ".png"
    object_key = f"tracks/{track.id}/cover{extension}"

    try:
        upload_audio_file(file=file, object_key=object_key)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service is unavailable",
        ) from exc

    previous_key = track.cover_image_key
    track.cover_image_key = object_key
    db.commit()
    db.refresh(track)

    if previous_key and previous_key != object_key:
        try:
            delete_audio_file(previous_key)
        except RuntimeError:
            pass

    return _to_response(track)


