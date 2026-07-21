from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


from app.core.storage import get_audio_url


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    cover_image_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    owner: Mapped["User"] = relationship(back_populates="playlists")
    playlist_tracks: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="playlist",
        order_by="PlaylistTrack.position",
        cascade="all, delete-orphan",
    )

    @property
    def cover_url(self) -> str | None:
        if self.cover_image_key:
            return get_audio_url(self.cover_image_key)
        return None

