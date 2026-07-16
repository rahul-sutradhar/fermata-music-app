from pydantic import BaseModel, Field

from app.schemas.track import TrackResponse


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class PlaylistResponse(BaseModel):
    id: int
    name: str
    user_id: int


class PlaylistItemCreate(BaseModel):
    track_id: int = Field(gt=0)
    position: int | None = Field(default=None, gt=0)


class PlaylistItemUpdate(BaseModel):
    position: int = Field(gt=0)


class PlaylistItemResponse(BaseModel):
    track: TrackResponse
    position: int


class CoverUploadResponse(BaseModel):
    filename: str
    path: str
