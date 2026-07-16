from pydantic import BaseModel, Field
from typing import List

from app.schemas.track import TrackResponse
from app.schemas.album import AlbumResponse
from app.schemas.artist import ArtistResponse


class SearchResultItem(BaseModel):
    type: str
    id: int
    title: str
    subtitle: str | None = None


class SearchResponse(BaseModel):
    q: str
    limit: int
    results: List[SearchResultItem]
    tracks: List[TrackResponse] = Field(default_factory=list)
    albums: List[AlbumResponse] = Field(default_factory=list)
    artists: List[ArtistResponse] = Field(default_factory=list)
