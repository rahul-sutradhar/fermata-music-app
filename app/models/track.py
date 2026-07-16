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

    album: Mapped["Album"] = relationship(back_populates="tracks")
    playlist_tracks: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="track"
    )
