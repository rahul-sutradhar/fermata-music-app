"""Library schemas."""

from datetime import datetime

from pydantic import BaseModel


class LibraryItemResponse(BaseModel):
    """Response for items in user library."""

    id: int
    track_id: int
    added_at: datetime

    class Config:
        from_attributes = True
