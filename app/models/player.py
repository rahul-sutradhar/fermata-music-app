"""Player state model for tracking playback."""

from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PlayerState(Base):
    """User's current playback state."""

    __tablename__ = "player_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    track_id: Mapped[int | None] = mapped_column(
        ForeignKey("tracks.id", ondelete="SET NULL"), nullable=True
    )
    is_playing: Mapped[bool] = mapped_column(default=False)
    progress_ms: Mapped[int] = mapped_column(default=0)
    volume: Mapped[int] = mapped_column(default=100)  # 0-100
    shuffle: Mapped[bool] = mapped_column(default=False)
    repeat_mode: Mapped[str] = mapped_column(default="off")  # off, context, track
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user = relationship("User", back_populates="player_state")
    track = relationship("Track")

    def __repr__(self) -> str:
        return f"<PlayerState user_id={self.user_id} track_id={self.track_id}>"


class RecentlyPlayed(Base):
    """Track recently played by user."""

    __tablename__ = "recently_played"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"))
    played_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="recently_played")
    track = relationship("Track")

    def __repr__(self) -> str:
        return f"<RecentlyPlayed user_id={self.user_id} track_id={self.track_id}>"
