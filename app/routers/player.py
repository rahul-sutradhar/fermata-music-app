"""Player router."""

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.errors import ErrorResponse
from app.schemas.player import PlayerStateResponse, PlayerStateUpdate, RecentlyPlayedResponse
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
