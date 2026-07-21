from pydantic import BaseModel, Field

class AlbumCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    artist_id: int = Field(..., gt=0)

class AlbumUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    artist_id: int | None = Field(None, gt=0)

from datetime import datetime

class AlbumResponse(BaseModel):
    id: int
    title: str
    artist_id: int
    artist_name: str | None = None
    cover_url: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True



