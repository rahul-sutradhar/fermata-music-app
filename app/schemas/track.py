from pydantic import BaseModel, Field, model_validator


class TrackCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    album_id: int = Field(gt=0)
    duration_seconds: int | None = Field(default=None, gt=0)


class TrackUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    album_id: int | None = Field(default=None, gt=0)
    duration_seconds: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "TrackUpdate":
        if self.title is None and self.album_id is None and self.duration_seconds is None:
            raise ValueError("At least one field must be provided")
        return self


class TrackResponse(BaseModel):
    id: int
    title: str
    album_id: int
    duration_seconds: int | None
    audio_url: str | None = None
    album_title: str | None = None
    artist_id: int | None = None
    artist_name: str | None = None

    class Config:
        from_attributes = True
