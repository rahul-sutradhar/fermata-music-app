from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.playlist import Playlist
from app.models.playlist_track import PlaylistTrack
from app.models.track import Track
from app.schemas.playlist import (
    CoverUploadResponse,
    PlaylistCreate,
    PlaylistItemCreate,
    PlaylistItemResponse,
    PlaylistItemUpdate,
    PlaylistResponse,
)
from app.schemas.track import TrackResponse


_PLAYLIST_COVER_DIR = Path(__file__).resolve().parents[2] / "storage" / "playlist_covers"


def _to_playlist_response(playlist: Playlist) -> PlaylistResponse:
    return PlaylistResponse(
        id=playlist.id,
        name=playlist.name,
        user_id=playlist.user_id,
        cover_url=playlist.cover_url,
    )



from app.core.storage import get_audio_url
from app.models.album import Album


def _to_track_response(track: Track) -> TrackResponse:
    return TrackResponse(
        id=track.id,
        title=track.title,
        album_id=track.album_id,
        duration_seconds=track.duration_seconds,
        audio_url=get_audio_url(track.audio_file_key) if track.audio_file_key else None,
        album_title=track.album_title,
        artist_id=track.artist_id,
        artist_name=track.artist_name,
    )


def _to_playlist_item_response(item: PlaylistTrack) -> PlaylistItemResponse:
    return PlaylistItemResponse(track=_to_track_response(item.track), position=item.position)


def _get_playlist_or_404(db: Session, playlist_id: int) -> Playlist:
    playlist = db.get(Playlist, playlist_id)
    if playlist is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Playlist {playlist_id} not found",
        )
    return playlist


def _ensure_playlist_owner(playlist: Playlist, user_id: int) -> None:
    if playlist.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this playlist",
        )


def _get_playlist_items(db: Session, playlist_id: int) -> list[PlaylistTrack]:
    return list(
        db.scalars(
            select(PlaylistTrack)
            .options(joinedload(PlaylistTrack.track).joinedload(Track.album).joinedload(Album.artist))
            .where(PlaylistTrack.playlist_id == playlist_id)
            .order_by(PlaylistTrack.position)
        ).all()
    )



def _resequence_playlist_items(db: Session, items: list[PlaylistTrack]) -> None:
    for index, item in enumerate(items, start=1):
        item.position = -index
    db.flush()

    for index, item in enumerate(items, start=1):
        item.position = index
    db.flush()


def list_user_playlists(*, db: Session, user_id: int) -> list[PlaylistResponse]:
    playlists = db.scalars(
        select(Playlist).where(Playlist.user_id == user_id).order_by(Playlist.id)
    ).all()
    return [_to_playlist_response(playlist) for playlist in playlists]


def create_playlist(*, db: Session, payload: PlaylistCreate, user_id: int) -> PlaylistResponse:
    playlist = Playlist(name=payload.name, user_id=user_id)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_playlist_response(playlist)


def list_playlist_items(*, db: Session, playlist_id: int, user_id: int) -> list[PlaylistItemResponse]:
    playlist = _get_playlist_or_404(db, playlist_id)
    _ensure_playlist_owner(playlist, user_id)
    return [_to_playlist_item_response(item) for item in _get_playlist_items(db, playlist_id)]


def add_playlist_item(
    *, db: Session, playlist_id: int, payload: PlaylistItemCreate, user_id: int
) -> PlaylistItemResponse:
    playlist = _get_playlist_or_404(db, playlist_id)
    _ensure_playlist_owner(playlist, user_id)

    track = db.get(Track, payload.track_id)
    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {payload.track_id} not found",
        )

    if db.scalar(
        select(PlaylistTrack.id)
        .where(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == payload.track_id,
        )
        .limit(1)
    ) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Track already exists in playlist",
        )

    items = _get_playlist_items(db, playlist_id)
    new_item = PlaylistTrack(playlist_id=playlist_id, track_id=payload.track_id, position=1)
    new_item.track = track

    if payload.position is None:
        items.append(new_item)
    else:
        if payload.position > len(items) + 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Position is out of range",
            )
        items.insert(payload.position - 1, new_item)

    db.add(new_item)
    _resequence_playlist_items(db, items)
    db.commit()
    return _to_playlist_item_response(new_item)


def update_playlist_item(
    *, db: Session, playlist_id: int, track_id: int, payload: PlaylistItemUpdate, user_id: int
) -> PlaylistItemResponse:
    playlist = _get_playlist_or_404(db, playlist_id)
    _ensure_playlist_owner(playlist, user_id)

    items = _get_playlist_items(db, playlist_id)
    current_item = next((item for item in items if item.track_id == track_id), None)
    if current_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found in playlist {playlist_id}",
        )

    if payload.position > len(items):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Position is out of range",
        )

    items.remove(current_item)
    items.insert(payload.position - 1, current_item)
    _resequence_playlist_items(db, items)
    db.commit()
    return _to_playlist_item_response(current_item)


def delete_playlist_item(*, db: Session, playlist_id: int, track_id: int, user_id: int) -> None:
    playlist = _get_playlist_or_404(db, playlist_id)
    _ensure_playlist_owner(playlist, user_id)

    items = _get_playlist_items(db, playlist_id)
    item = next((entry for entry in items if entry.track_id == track_id), None)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Track {track_id} not found in playlist {playlist_id}",
        )

    items.remove(item)
    db.delete(item)
    _resequence_playlist_items(db, items)
    db.commit()


from app.schemas.playlist import PlaylistUpdate


def update_playlist(*, db: Session, playlist_id: int, payload: PlaylistUpdate, user_id: int) -> PlaylistResponse:
    playlist = _get_playlist_or_404(db, playlist_id)
    _ensure_playlist_owner(playlist, user_id)

    if payload.name is not None:
        playlist.name = payload.name

    db.commit()
    db.refresh(playlist)
    return _to_playlist_response(playlist)


def save_playlist_cover(
    *, db: Session, playlist_id: int, cover_file: UploadFile, user_id: int
) -> PlaylistResponse:
    playlist = _get_playlist_or_404(db, playlist_id)
    _ensure_playlist_owner(playlist, user_id)

    content_type = cover_file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cover image must be an image file",
        )

    suffix = Path(cover_file.filename or "").suffix or mimetypes.guess_extension(content_type) or ".img"
    _PLAYLIST_COVER_DIR.mkdir(parents=True, exist_ok=True)
    cover_path = _PLAYLIST_COVER_DIR / f"playlist-{playlist_id}{suffix}"
    cover_path.write_bytes(cover_file.file.read())

    playlist.cover_image_key = f"playlists/playlist-{playlist_id}{suffix}"
    db.commit()
    db.refresh(playlist)

    return _to_playlist_response(playlist)


from app.models.user import User

def delete_playlist(*, db: Session, playlist_id: int, user: User) -> None:
    playlist = _get_playlist_or_404(db, playlist_id)
    _ensure_playlist_owner(playlist, user.id)

    db.delete(playlist)
    db.commit()






