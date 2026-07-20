import re
from fastapi import APIRouter, Depends, File, Query, UploadFile, status, Request, HTTPException
from fastapi.responses import StreamingResponse, RedirectResponse

from app.core.deps import CurrentUser, DbSession, CurrentArtistOrAdmin
from app.schemas.errors import ErrorResponse
from app.schemas.track import TrackCreate, TrackResponse, TrackUpdate
from app.services import tracks as track_service
from app.core.storage import get_b2_client
from app.core.config import settings
from app.models.track import Track

router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.get("", response_model=list[TrackResponse])
def list_tracks(
    db: DbSession,
    skip: int = Query(0, ge=0, description="Number of tracks to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum tracks to return"),
    q: str | None = Query(None, description="Filter tracks by title"),
) -> list[TrackResponse]:
    """List tracks with optional pagination and title search."""
    return track_service.list_tracks(db=db, skip=skip, limit=limit, q=q)


@router.post(
    "",
    response_model=TrackResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
    },
)
def create_track(
    payload: TrackCreate,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> TrackResponse:
    """Create a new track."""
    return track_service.create_track(db=db, payload=payload, user=current_user)


@router.get(
    "/{track_id}",
    response_model=TrackResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_track(track_id: int, db: DbSession) -> TrackResponse:
    """Return a single track by ID."""
    return track_service.get_track(db=db, track_id=track_id)


@router.post(
    "/{track_id}/audio",
    response_model=TrackResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def upload_track_audio(
    track_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
    file: UploadFile = File(...),
) -> TrackResponse:
    """Upload an audio file for an existing track."""
    return track_service.upload_track_audio(
        db=db,
        track_id=track_id,
        file=file,
        user=current_user,
    )


@router.get(
    "/{track_id}/audio",
    response_model=dict,
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def get_track_audio_url(track_id: int, db: DbSession) -> dict:
    """Return a signed URL for track playback."""
    return {"audio_url": track_service.get_track_audio_url(db=db, track_id=track_id)}


@router.get(
    "/{track_id}/audio/play",
    responses={
        307: {"description": "Redirects to direct presigned storage URL"},
        404: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def play_track_audio(
    track_id: int,
    db: DbSession,
):
    """Redirect to the presigned B2 storage URL directly to avoid proxying bandwidth."""
    audio_url = track_service.get_track_audio_url(db=db, track_id=track_id)
    return RedirectResponse(url=audio_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.patch(
    "/{track_id}",
    response_model=TrackResponse,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def update_track(
    track_id: int,
    payload: TrackUpdate,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> TrackResponse:
    """Update an existing track."""
    return track_service.update_track(
        db=db, track_id=track_id, payload=payload, user=current_user
    )


@router.delete(
    "/{track_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def delete_track(track_id: int, db: DbSession, current_user: CurrentArtistOrAdmin) -> None:
    """Delete a track."""
    track_service.delete_track(db=db, track_id=track_id, user=current_user)
