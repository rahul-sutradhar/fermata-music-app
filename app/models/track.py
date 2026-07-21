from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id"), nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(nullable=True)
    audio_file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cover_image_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    album: Mapped["Album"] = relationship(back_populates="tracks")
    playlist_tracks: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="track"
    )

    @property
    def album_title(self) -> str | None:
        return self.album.title if self.album else None

    @property
    def artist_id(self) -> int | None:
        return self.album.artist_id if self.album else None

    @property
    def artist_name(self) -> str | None:
        return self.album.artist.name if (self.album and self.album.artist) else None

    @property
    def cover_url(self) -> str | None:
        from app.core.storage import get_audio_url
        if self.cover_image_key:
            return get_audio_url(self.cover_image_key)
        return self.album.cover_url if self.album else None

