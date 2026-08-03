from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.track import Track


class TrackBackup(Base):
    __tablename__ = "track_backups"

    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True)
    backup_file_key: Mapped[str] = mapped_column(String(512), nullable=False)

    track: Mapped["Track"] = relationship(foreign_keys=[track_id])
