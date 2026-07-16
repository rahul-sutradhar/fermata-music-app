"""Content service for shows, episodes, audiobooks, chapters."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Audiobook, Chapter, Episode, Show


def get_show(db: Session, show_id: int) -> Show:
    """Get show by ID."""
    show = db.get(Show, show_id)
    if not show:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Show not found"
        )
    return show


def get_show_episodes(db: Session, show_id: int, skip: int = 0, limit: int = 20) -> list[Episode]:
    """Get episodes for a show."""
    return db.scalars(
        select(Episode)
        .where(Episode.show_id == show_id)
        .order_by(Episode.published_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()


def get_episode(db: Session, episode_id: int) -> Episode:
    """Get episode by ID."""
    episode = db.get(Episode, episode_id)
    if not episode:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found"
        )
    return episode


def get_audiobook(db: Session, audiobook_id: int) -> Audiobook:
    """Get audiobook by ID."""
    audiobook = db.get(Audiobook, audiobook_id)
    if not audiobook:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audiobook not found"
        )
    return audiobook


def get_audiobook_chapters(
    db: Session, audiobook_id: int, skip: int = 0, limit: int = 20
) -> list[Chapter]:
    """Get chapters for an audiobook."""
    return db.scalars(
        select(Chapter)
        .where(Chapter.audiobook_id == audiobook_id)
        .order_by(Chapter.chapter_number)
        .offset(skip)
        .limit(limit)
    ).all()


def get_chapter(db: Session, chapter_id: int) -> Chapter:
    """Get chapter by ID."""
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found"
        )
    return chapter
