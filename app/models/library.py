"""User library model (liked tracks)."""

from datetime import datetime

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserLibrary(Base):
    """Join table for user-liked tracks."""

    __tablename__ = "user_library"
    __table_args__ = (UniqueConstraint("user_id", "track_id", name="uq_user_track"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"))
    added_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="library")
    track = relationship("Track")

    def __repr__(self) -> str:
        return f"<UserLibrary user_id={self.user_id} track_id={self.track_id}>"
