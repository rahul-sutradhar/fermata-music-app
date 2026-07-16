"""Library service."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Track, UserLibrary


def add_to_library(db: Session, user_id: int, track_id: int) -> UserLibrary:
    """Add track to user library."""
    # Check if already in library
    existing = db.scalar(
        select(UserLibrary).where(
            UserLibrary.user_id == user_id, UserLibrary.track_id == track_id
        )
    )
    if existing:
        return existing

    # Check if track exists
    track = db.get(Track, track_id)
    if not track:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Track not found"
        )

    item = UserLibrary(user_id=user_id, track_id=track_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def remove_from_library(db: Session, user_id: int, track_id: int) -> bool:
    """Remove track from user library."""
    item = db.scalar(
        select(UserLibrary).where(
            UserLibrary.user_id == user_id, UserLibrary.track_id == track_id
        )
    )
    if not item:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not in library",
        )
    db.delete(item)
    db.commit()
    return True


def contains_in_library(db: Session, user_id: int, track_ids: list[int]) -> dict[int, bool]:
    """Check if tracks are in user library."""
    items = db.scalars(
        select(UserLibrary).where(
            UserLibrary.user_id == user_id,
            UserLibrary.track_id.in_(track_ids),
        )
    ).all()
    item_ids = {item.track_id for item in items}
    return {track_id: track_id in item_ids for track_id in track_ids}


def get_user_library(
    db: Session, user_id: int, skip: int = 0, limit: int = 20
) -> list[UserLibrary]:
    """Get user's library (liked tracks)."""
    return db.scalars(
        select(UserLibrary)
        .where(UserLibrary.user_id == user_id)
        .order_by(UserLibrary.added_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()
