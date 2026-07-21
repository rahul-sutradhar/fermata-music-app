from pydantic import BaseModel, Field

class ArtistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    user_id: int | None = None

class ArtistUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    user_id: int | None = None

from datetime import datetime

class ArtistResponse(BaseModel):
    id: int
    name: str
    user_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True

