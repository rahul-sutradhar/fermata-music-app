"""Player schemas."""

from pydantic import BaseModel, Field


class PlayerStateResponse(BaseModel):
    """Player state response."""

    id: int
    track_id: int | None
    is_playing: bool
    progress_ms: int
    volume: int = Field(ge=0, le=100)
    shuffle: bool
    repeat_mode: str  # off, context, track

    class Config:
        from_attributes = True


class PlayerStateUpdate(BaseModel):
    """Update player state."""

    is_playing: bool | None = None
    progress_ms: int | None = Field(None, ge=0)
    volume: int | None = Field(None, ge=0, le=100)
    shuffle: bool | None = None
    repeat_mode: str | None = None  # off, context, track
    track_id: int | None = None


class RecentlyPlayedResponse(BaseModel):
    """Recently played item."""

    id: int
    track_id: int
    played_at: str

    class Config:
        from_attributes = True
