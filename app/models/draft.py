from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, String, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.artist import Artist
    from app.models.track import Track


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), default="Untitled Recording", nullable=False)
    audio_file_key: Mapped[str] = mapped_column(String(512), nullable=False)
    backing_track_id: Mapped[int | None] = mapped_column(ForeignKey("tracks.id", ondelete="SET NULL"), nullable=True)
    backing_file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_split: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # B2 keys for 6-stem split backing track layers (htdemucs_6s)
    split_vocals_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    split_drums_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    split_bass_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    split_other_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    split_guitar_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    split_piano_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    
    # Store dynamic mix settings as a JSON string
    mix_volumes: Mapped[str] = mapped_column(
        String(512), 
        default='{"vocal":1.0,"music":1.0,"bass":1.0,"drums":1.0,"guitar":1.0,"piano":1.0}', 
        nullable=False
    )
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    artist: Mapped["Artist"] = relationship(foreign_keys=[artist_id])
    backing_track: Mapped["Track | None"] = relationship(foreign_keys=[backing_track_id])
