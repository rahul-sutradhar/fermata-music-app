from fastapi import APIRouter, Query, status, HTTPException

from app.core.deps import DbSession, CurrentAdmin, CurrentArtistOrAdmin
from app.schemas.album import AlbumResponse
from app.schemas.artist import ArtistResponse, ArtistCreate, ArtistUpdate
from app.schemas.errors import ErrorResponse
from app.services import artists as artist_service

router = APIRouter(prefix="/artists", tags=["artists"])


@router.get(
    "",
    response_model=list[ArtistResponse],
)
def list_artists(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> list[ArtistResponse]:
    """List all artists with pagination."""
    from sqlalchemy import select
    from app.models.artist import Artist
    artists = db.scalars(select(Artist).order_by(Artist.id).offset(skip).limit(limit)).all()
    return [artist_service._to_artist_response(a) for a in artists]


@router.get(
    "/{artist_id}",
    response_model=ArtistResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_artist(artist_id: int, db: DbSession) -> ArtistResponse:
    """Return a single artist by ID."""
    return artist_service.get_artist(db=db, artist_id=artist_id)


@router.get(
    "/{artist_id}/albums",
    response_model=list[AlbumResponse],
    responses={404: {"model": ErrorResponse}},
)
def list_artist_albums(
    artist_id: int,
    db: DbSession,
    skip: int = Query(0, ge=0, description="Number of albums to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum albums to return"),
) -> list[AlbumResponse]:
    """Return albums released by a single artist."""
    return artist_service.list_artist_albums(
        db=db, artist_id=artist_id, skip=skip, limit=limit
    )


from app.schemas.track import TrackResponse

@router.get(
    "/{artist_id}/singles",
    response_model=list[TrackResponse],
    responses={404: {"model": ErrorResponse}},
)
def list_artist_singles(
    artist_id: int,
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> list[TrackResponse]:
    """Return standalone single tracks released by an artist."""
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from app.models.track import Track
    from app.models.album import Album
    from app.services.tracks import _to_response

    artist_service._get_artist_or_404(db, artist_id)

    query = (
        select(Track)
        .options(joinedload(Track.album).joinedload(Album.artist), joinedload(Track.artist_rel))
        .where(Track.artist_id == artist_id, Track.album_id.is_(None))
        .order_by(Track.id)
        .offset(skip)
        .limit(limit)
    )
    tracks = db.scalars(query).all()
    return [_to_response(t) for t in tracks]



@router.post(
    "",
    response_model=ArtistResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"model": ErrorResponse}},
)
def create_artist(
    payload: ArtistCreate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> ArtistResponse:
    """Create a new artist (Admin only)."""
    return artist_service.create_artist(db=db, name=payload.name, user_id=payload.user_id)


@router.patch(
    "/{artist_id}",
    response_model=ArtistResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_artist(
    artist_id: int,
    payload: ArtistUpdate,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> ArtistResponse:
    """Update an artist (Admin or owning Artist)."""
    # Check ownership if not admin
    artist = artist_service._get_artist_or_404(db, artist_id)
    if current_user.role != "admin" and artist.id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    
    return artist_service.update_artist(db=db, artist_id=artist_id, name=payload.name, user_id=payload.user_id)


@router.delete(
    "/{artist_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def delete_artist(
    artist_id: int,
    db: DbSession,
    current_user: CurrentAdmin,
) -> None:
    """Delete an artist (Admin only)."""
    artist_service.delete_artist(db=db, artist_id=artist_id)
