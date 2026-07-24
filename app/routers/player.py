"""Player router."""

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.errors import ErrorResponse
from app.schemas.player import PlayerStateResponse, PlayerStateUpdate, RecentlyPlayedResponse
from app.schemas.track import TrackResponse
from app.schemas.album import AlbumResponse
from app.services import player as player_service

router = APIRouter(prefix="/me/player", tags=["player"])


@router.get(
    "",
    response_model=PlayerStateResponse,
    responses={401: {"model": ErrorResponse}},
)
def get_player_state(
    db: DbSession,
    current_user: CurrentUser,
) -> PlayerStateResponse:
    """Get current player state."""
    state = player_service.get_or_create_player_state(db, current_user.id)
    return PlayerStateResponse.model_validate(state)


@router.patch(
    "",
    response_model=PlayerStateResponse,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def update_player(
    db: DbSession,
    current_user: CurrentUser,
    payload: PlayerStateUpdate,
) -> PlayerStateResponse:
    """Update player state."""
    state = player_service.update_player_state(
        db,
        current_user.id,
        is_playing=payload.is_playing,
        progress_ms=payload.progress_ms,
        volume=payload.volume,
        shuffle=payload.shuffle,
        repeat_mode=payload.repeat_mode,
        track_id=payload.track_id,
    )
    return PlayerStateResponse.model_validate(state)


@router.post(
    "/recently-played",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def add_recently_played(
    db: DbSession,
    current_user: CurrentUser,
    track_id: int = Query(..., description="Track ID to add to recently played"),
) -> None:
    """Add track to recently played."""
    player_service.add_to_recently_played(db, current_user.id, track_id)


@router.get(
    "/recently-played",
    response_model=list[RecentlyPlayedResponse],
    responses={401: {"model": ErrorResponse}},
)
def get_recently_played(
    db: DbSession,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[RecentlyPlayedResponse]:
    """Get recently played tracks."""
    items = player_service.get_recently_played(db, current_user.id, skip, limit)
    return [RecentlyPlayedResponse.model_validate(item) for item in items]


@router.get(
    "/most-played-tracks",
    response_model=list[TrackResponse],
    responses={401: {"model": ErrorResponse}},
)
def get_most_played_tracks(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(10, ge=1, le=50)
) -> list[TrackResponse]:
    """Get user's most played tracks based on play count in recently_played."""
    from sqlalchemy import func, desc, select
    from app.models import RecentlyPlayed, Track
    from app.services.tracks import _to_response as track_to_response
    
    # Subquery to aggregate play count per track
    top_track_ids = (
        db.query(RecentlyPlayed.track_id, func.count(RecentlyPlayed.id).label("play_count"))
        .filter(RecentlyPlayed.user_id == current_user.id)
        .group_by(RecentlyPlayed.track_id)
        .order_by(desc("play_count"))
        .limit(limit)
        .all()
    )
    
    track_ids = [t[0] for t in top_track_ids]
    if not track_ids:
        # Fallback: return newest/arbitrary tracks if no play history
        tracks = db.scalars(select(Track).order_by(Track.id.desc()).limit(limit)).all()
    else:
        # Fetch the actual track objects
        tracks = db.scalars(select(Track).where(Track.id.in_(track_ids))).all()
        # Re-sort to maintain the play count descending order
        tracks = sorted(tracks, key=lambda t: track_ids.index(t.id))
        
    return [track_to_response(t) for t in tracks]


@router.get(
    "/recently-played-albums",
    response_model=list[AlbumResponse],
    responses={401: {"model": ErrorResponse}},
)
def get_recently_played_albums(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(10, ge=1, le=50)
) -> list[AlbumResponse]:
    """Get user's recently played albums based on track history."""
    from sqlalchemy import desc, select, func
    from app.models import RecentlyPlayed, Track, Album
    from app.services.albums import _to_album_response as album_to_response
    
    # Fetch recently played tracks for the user that are linked to an album
    recent_tracks = (
        db.query(Track.album_id, func.max(RecentlyPlayed.played_at).label("last_played"))
        .join(RecentlyPlayed, Track.id == RecentlyPlayed.track_id)
        .filter(RecentlyPlayed.user_id == current_user.id)
        .filter(Track.album_id != None)
        .group_by(Track.album_id)
        .order_by(desc("last_played"))
        .limit(limit)
        .all()
    )
    
    album_ids = [r[0] for r in recent_tracks]
    if not album_ids:
        # Fallback: return newest albums
        albums = db.scalars(select(Album).order_by(Album.id.desc()).limit(limit)).all()
    else:
        albums = db.scalars(select(Album).where(Album.id.in_(album_ids))).all()
        albums = sorted(albums, key=lambda a: album_ids.index(a.id))
        
    return [album_to_response(a) for a in albums]


@router.get(
    "/most-played-albums",
    response_model=list[AlbumResponse],
    responses={401: {"model": ErrorResponse}},
)
def get_most_played_albums(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(10, ge=1, le=50)
) -> list[AlbumResponse]:
    """Get user's most played albums based on play counts of its tracks."""
    from sqlalchemy import func, desc, select
    from app.models import RecentlyPlayed, Track, Album
    from app.services.albums import _to_album_response as album_to_response
    
    top_albums = (
        db.query(Track.album_id, func.count(RecentlyPlayed.id).label("play_count"))
        .join(RecentlyPlayed, Track.id == RecentlyPlayed.track_id)
        .filter(RecentlyPlayed.user_id == current_user.id)
        .filter(Track.album_id != None)
        .group_by(Track.album_id)
        .order_by(desc("play_count"))
        .limit(limit)
        .all()
    )
    
    album_ids = [a[0] for a in top_albums]
    if not album_ids:
        # Fallback: return popular or arbitrary albums
        albums = db.scalars(select(Album).order_by(Album.id.asc()).limit(limit)).all()
    else:
        albums = db.scalars(select(Album).where(Album.id.in_(album_ids))).all()
        albums = sorted(albums, key=lambda a: album_ids.index(a.id))
        
    return [album_to_response(a) for a in albums]
