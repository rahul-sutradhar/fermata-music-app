from fastapi import APIRouter, File, UploadFile, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.errors import ErrorResponse
from app.schemas.playlist import (
    CoverUploadResponse,
    PlaylistCreate,
    PlaylistItemCreate,
    PlaylistItemResponse,
    PlaylistItemUpdate,
    PlaylistResponse,
)
from app.services import playlists as playlist_service

router = APIRouter(tags=["playlists"])


@router.get("/me/playlists", response_model=list[PlaylistResponse])
def list_my_playlists(db: DbSession, current_user: CurrentUser) -> list[PlaylistResponse]:
    """Return playlists owned by the current user."""
    return playlist_service.list_user_playlists(db=db, user_id=current_user.id)


@router.post(
    "/me/playlists",
    response_model=PlaylistResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
)
def create_my_playlist(
    payload: PlaylistCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> PlaylistResponse:
    """Create a new playlist for the current user."""
    return playlist_service.create_playlist(db=db, payload=payload, user_id=current_user.id)


@router.get(
    "/playlists/{playlist_id}/items",
    response_model=list[PlaylistItemResponse],
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def list_playlist_items(
    playlist_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> list[PlaylistItemResponse]:
    """Return ordered tracks for a playlist."""
    return playlist_service.list_playlist_items(
        db=db, playlist_id=playlist_id, user_id=current_user.id
    )


@router.post(
    "/playlists/{playlist_id}/items",
    response_model=PlaylistItemResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def add_playlist_item(
    playlist_id: int,
    payload: PlaylistItemCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> PlaylistItemResponse:
    """Add a track to a playlist."""
    return playlist_service.add_playlist_item(
        db=db, playlist_id=playlist_id, payload=payload, user_id=current_user.id
    )


@router.patch(
    "/playlists/{playlist_id}/items/{track_id}",
    response_model=PlaylistItemResponse,
    responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_playlist_item(
    playlist_id: int,
    track_id: int,
    payload: PlaylistItemUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> PlaylistItemResponse:
    """Move a playlist track to a new position."""
    return playlist_service.update_playlist_item(
        db=db,
        playlist_id=playlist_id,
        track_id=track_id,
        payload=payload,
        user_id=current_user.id,
    )


@router.delete(
    "/playlists/{playlist_id}/items/{track_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def delete_playlist_item(
    playlist_id: int,
    track_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    """Remove a track from a playlist."""
    playlist_service.delete_playlist_item(
        db=db, playlist_id=playlist_id, track_id=track_id, user_id=current_user.id
    )


@router.post(
    "/playlists/{playlist_id}/cover",
    response_model=CoverUploadResponse,
    responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def upload_playlist_cover(
    playlist_id: int,
    db: DbSession,
    current_user: CurrentUser,
    cover_file: UploadFile = File(..., description="Playlist cover image"),
) -> CoverUploadResponse:
    """Upload a playlist cover image."""
    return playlist_service.save_playlist_cover(
        db=db,
        playlist_id=playlist_id,
        cover_file=cover_file,
        user_id=current_user.id,
    )


@router.delete(
    "/playlists/{playlist_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def delete_playlist(
    playlist_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> None:
    """Delete a playlist owned by the current user (or Admin)."""
    playlist_service.delete_playlist(db=db, playlist_id=playlist_id, user=current_user)

