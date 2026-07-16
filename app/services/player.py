"""Player service."""

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models import PlayerState, RecentlyPlayed, Track


def get_or_create_player_state(db: Session, user_id: int) -> PlayerState:
    """Get or create player state for user."""
    state = db.scalar(select(PlayerState).where(PlayerState.user_id == user_id))
    if not state:
        state = PlayerState(user_id=user_id)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def update_player_state(
    db: Session,
    user_id: int,
    is_playing: bool | None = None,
    progress_ms: int | None = None,
    volume: int | None = None,
    shuffle: bool | None = None,
    repeat_mode: str | None = None,
    track_id: int | None = None,
) -> PlayerState:
    """Update player state."""
    state = get_or_create_player_state(db, user_id)

    if is_playing is not None:
        state.is_playing = is_playing
    if progress_ms is not None:
        state.progress_ms = progress_ms
    if volume is not None:
        state.volume = volume
    if shuffle is not None:
        state.shuffle = shuffle
    if repeat_mode is not None:
        state.repeat_mode = repeat_mode
    if track_id is not None:
        state.track_id = track_id

    db.commit()
    db.refresh(state)
    return state


def add_to_recently_played(db: Session, user_id: int, track_id: int) -> RecentlyPlayed:
    """Add track to recently played."""
    # Check if track exists
    track = db.get(Track, track_id)
    if not track:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Track not found"
        )

    item = RecentlyPlayed(user_id=user_id, track_id=track_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_recently_played(
    db: Session, user_id: int, skip: int = 0, limit: int = 20
) -> list[RecentlyPlayed]:
    """Get user's recently played tracks."""
    return db.scalars(
        select(RecentlyPlayed)
        .where(RecentlyPlayed.user_id == user_id)
        .order_by(desc(RecentlyPlayed.played_at))
        .offset(skip)
        .limit(limit)
    ).all()
