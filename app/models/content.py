"""Show, Episode, Audiobook, and Chapter models."""

from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Show(Base):
    """Podcast show."""

    __tablename__ = "show"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    description: Mapped[str | None] = mapped_column(nullable=True)
    image_url: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    episodes: Mapped[list["Episode"]] = relationship(
        "Episode", back_populates="show", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Show id={self.id} title={self.title}>"


class Episode(Base):
    """Podcast episode."""

    __tablename__ = "episode"

    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("show.id", ondelete="CASCADE"))
    title: Mapped[str]
    description: Mapped[str | None] = mapped_column(nullable=True)
    audio_url: Mapped[str | None] = mapped_column(nullable=True)
    duration_ms: Mapped[int] = mapped_column(default=0)
    published_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Relationships
    show: Mapped["Show"] = relationship("Show", back_populates="episodes")

    def __repr__(self) -> str:
        return f"<Episode id={self.id} title={self.title}>"


class Audiobook(Base):
    """Audiobook."""

    __tablename__ = "audiobook"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    author: Mapped[str | None] = mapped_column(nullable=True)
    description: Mapped[str | None] = mapped_column(nullable=True)
    image_url: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    chapters: Mapped[list["Chapter"]] = relationship(
        "Chapter", back_populates="audiobook", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Audiobook id={self.id} title={self.title}>"


class Chapter(Base):
    """Audiobook chapter."""

    __tablename__ = "chapter"

    id: Mapped[int] = mapped_column(primary_key=True)
    audiobook_id: Mapped[int] = mapped_column(
        ForeignKey("audiobook.id", ondelete="CASCADE")
    )
    title: Mapped[str]
    description: Mapped[str | None] = mapped_column(nullable=True)
    audio_url: Mapped[str | None] = mapped_column(nullable=True)
    duration_ms: Mapped[int] = mapped_column(default=0)
    chapter_number: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Relationships
    audiobook: Mapped["Audiobook"] = relationship("Audiobook", back_populates="chapters")

    def __repr__(self) -> str:
        return f"<Chapter id={self.id} title={self.title}>"
