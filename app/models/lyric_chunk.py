from sqlalchemy import ForeignKey, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship, backref

from app.db.base import Base
from app.models.track import SQLiteFriendlyVector


class LyricChunk(Base):
    """Stores a segmented chunk of a track's lyrics along with its semantic embedding."""

    __tablename__ = "lyric_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(SQLiteFriendlyVector, nullable=True)

    # Relationship back to Track
    track = relationship("Track", backref=backref("lyric_chunks_rel", cascade="all, delete-orphan"))
