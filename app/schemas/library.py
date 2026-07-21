"""Library schemas."""

from datetime import datetime

from pydantic import BaseModel


class LibraryItemResponse(BaseModel):
    """Response for items in user library (liked tracks)."""

    id: int
    track_id: int
    added_at: datetime

    class Config:
        from_attributes = True


class LikedAlbumResponse(BaseModel):
    """Response for liked albums in user library."""

    id: int
    album_id: int
    added_at: datetime

    class Config:
        from_attributes = True

