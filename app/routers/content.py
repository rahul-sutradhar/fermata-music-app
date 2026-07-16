"""Content router for shows, episodes, audiobooks, chapters."""

from fastapi import APIRouter, Query, status

from app.core.deps import DbSession
from app.schemas.content import (
    AudiobookResponse,
    ChapterResponse,
    EpisodeResponse,
    ShowResponse,
)
from app.schemas.errors import ErrorResponse
from app.services import content as content_service

router = APIRouter(tags=["content"])


# Shows
@router.get(
    "/shows/{show_id}",
    response_model=ShowResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_show(show_id: int, db: DbSession) -> ShowResponse:
    """Get show by ID."""
    show = content_service.get_show(db, show_id)
    return ShowResponse.model_validate(show)


@router.get(
    "/shows/{show_id}/episodes",
    response_model=list[EpisodeResponse],
    responses={404: {"model": ErrorResponse}},
)
def get_show_episodes(
    show_id: int,
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[EpisodeResponse]:
    """Get episodes for a show."""
    content_service.get_show(db, show_id)  # Verify show exists
    episodes = content_service.get_show_episodes(db, show_id, skip, limit)
    return [EpisodeResponse.model_validate(ep) for ep in episodes]


# Episodes
@router.get(
    "/episodes/{episode_id}",
    response_model=EpisodeResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_episode(episode_id: int, db: DbSession) -> EpisodeResponse:
    """Get episode by ID."""
    episode = content_service.get_episode(db, episode_id)
    return EpisodeResponse.model_validate(episode)


# Audiobooks
@router.get(
    "/audiobooks/{audiobook_id}",
    response_model=AudiobookResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_audiobook(audiobook_id: int, db: DbSession) -> AudiobookResponse:
    """Get audiobook by ID."""
    audiobook = content_service.get_audiobook(db, audiobook_id)
    return AudiobookResponse.model_validate(audiobook)


@router.get(
    "/audiobooks/{audiobook_id}/chapters",
    response_model=list[ChapterResponse],
    responses={404: {"model": ErrorResponse}},
)
def get_audiobook_chapters(
    audiobook_id: int,
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[ChapterResponse]:
    """Get chapters for an audiobook."""
    content_service.get_audiobook(db, audiobook_id)  # Verify audiobook exists
    chapters = content_service.get_audiobook_chapters(db, audiobook_id, skip, limit)
    return [ChapterResponse.model_validate(ch) for ch in chapters]


# Chapters
@router.get(
    "/chapters/{chapter_id}",
    response_model=ChapterResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_chapter(chapter_id: int, db: DbSession) -> ChapterResponse:
    """Get chapter by ID."""
    chapter = content_service.get_chapter(db, chapter_id)
    return ChapterResponse.model_validate(chapter)
