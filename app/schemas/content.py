"""Show, Episode, Audiobook, and Chapter schemas."""

from pydantic import BaseModel


class EpisodeResponse(BaseModel):
    """Episode response."""

    id: int
    show_id: int
    title: str
    description: str | None
    audio_url: str | None
    duration_ms: int

    class Config:
        from_attributes = True


class ShowResponse(BaseModel):
    """Show response."""

    id: int
    title: str
    description: str | None
    image_url: str | None

    class Config:
        from_attributes = True


class ChapterResponse(BaseModel):
    """Chapter response."""

    id: int
    audiobook_id: int
    title: str
    description: str | None
    audio_url: str | None
    duration_ms: int
    chapter_number: int

    class Config:
        from_attributes = True


class AudiobookResponse(BaseModel):
    """Audiobook response."""

    id: int
    title: str
    author: str | None
    description: str | None
    image_url: str | None

    class Config:
        from_attributes = True
