from fastapi import APIRouter, Query, status, HTTPException

from app.core.deps import DbSession, CurrentArtistOrAdmin, CurrentAdmin
from app.schemas.album import AlbumResponse, AlbumCreate, AlbumUpdate
from app.schemas.errors import ErrorResponse
from app.schemas.track import TrackResponse
from app.services import albums as album_service
from app.services import artists as artist_service

router = APIRouter(prefix="/albums", tags=["albums"])


@router.get(
    "",
    response_model=list[AlbumResponse],
)
def list_albums(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> list[AlbumResponse]:
    """List all albums with pagination."""
    from sqlalchemy import select
    from app.models.album import Album
    albums = db.scalars(select(Album).order_by(Album.id).offset(skip).limit(limit)).all()
    return [AlbumResponse(id=a.id, title=a.title, artist_id=a.artist_id) for a in albums]


@router.get(
    "/{album_id}",
    response_model=AlbumResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_album(album_id: int, db: DbSession) -> AlbumResponse:
    """Return a single album by ID."""
    return album_service.get_album(db=db, album_id=album_id)


@router.get(
    "/{album_id}/tracks",
    response_model=list[TrackResponse],
    responses={404: {"model": ErrorResponse}},
)
def list_album_tracks(
    album_id: int,
    db: DbSession,
    skip: int = Query(0, ge=0, description="Number of tracks to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum tracks to return"),
) -> list[TrackResponse]:
    """Return tracks contained in a single album."""
    return album_service.list_album_tracks(
        db=db, album_id=album_id, skip=skip, limit=limit
    )


@router.post(
    "",
    response_model=AlbumResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def create_album(
    payload: AlbumCreate,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> AlbumResponse:
    """Create a new album (Admin or owning Artist)."""
    if current_user.role != "admin":
        artist = artist_service._get_artist_or_404(db, payload.artist_id)
        if artist.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
            
    return album_service.create_album(db=db, title=payload.title, artist_id=payload.artist_id)


@router.patch(
    "/{album_id}",
    response_model=AlbumResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_album(
    album_id: int,
    payload: AlbumUpdate,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> AlbumResponse:
    """Update an album (Admin or owning Artist)."""
    album = album_service._get_album_or_404(db, album_id)
    if current_user.role != "admin":
        artist = artist_service._get_artist_or_404(db, album.artist_id)
        if artist.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
            
        # If trying to transfer ownership to another artist, verify they own that one too
        if payload.artist_id is not None and payload.artist_id != album.artist_id:
            new_artist = artist_service._get_artist_or_404(db, payload.artist_id)
            if new_artist.user_id != current_user.id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot transfer album to an artist you do not own")
                
    return album_service.update_album(db=db, album_id=album_id, title=payload.title, artist_id=payload.artist_id)


@router.delete(
    "/{album_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def delete_album(
    album_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> None:
    """Delete an album (Admin or owning Artist)."""
    album = album_service._get_album_or_404(db, album_id)
    if current_user.role != "admin":
        artist = artist_service._get_artist_or_404(db, album.artist_id)
        if artist.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
            
    album_service.delete_album(db=db, album_id=album_id)
