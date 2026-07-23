from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    album_id: Mapped[int | None] = mapped_column(ForeignKey("albums.id"), nullable=True)
    artist_id: Mapped[int | None] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(nullable=True)
    audio_file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cover_image_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    genres: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)

    album: Mapped["Album | None"] = relationship(back_populates="tracks")
    artist_rel: Mapped["Artist | None"] = relationship(back_populates="standalone_tracks", foreign_keys=[artist_id])
    playlist_tracks: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="track"
    )

    @property
    def album_title(self) -> str | None:
        return self.album.title if self.album else None

    @property
    def effective_artist_id(self) -> int | None:
        if self.artist_id is not None:
            return self.artist_id
        return self.album.artist_id if self.album else None

    # Alias for backward compatibility
    @property
    def artist_id_value(self) -> int | None:
        return self.effective_artist_id

    @property
    def artist_name(self) -> str | None:
        if self.artist_rel:
            return self.artist_rel.name
        if self.album and self.album.artist:
            return self.album.artist.name
        return None

    @property
    def cover_url(self) -> str | None:
        from app.core.storage import get_audio_url
        if self.cover_image_key:
            return get_audio_url(self.cover_image_key)
        return self.album.cover_url if self.album else None
