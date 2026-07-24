from typing import TYPE_CHECKING
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.user import User

if TYPE_CHECKING:
    from app.models.album import Album
    from app.models.track import Track


class Artist(User):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    albums: Mapped[list["Album"]] = relationship(back_populates="artist")
    standalone_tracks: Mapped[list["Track"]] = relationship(
        back_populates="artist_rel",
        foreign_keys="Track.artist_id"
    )

    # Many-to-many relationship to Tracks
    tracks: Mapped[list["Track"]] = relationship(
        secondary="track_artists",
        back_populates="artists"
    )

    __mapper_args__ = {
        "polymorphic_identity": "artist",
    }

