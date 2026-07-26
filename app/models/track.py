from datetime import datetime
from typing import TYPE_CHECKING, Any
from sqlalchemy import DateTime, ForeignKey, String, func, Text, Table, Column, Integer, Computed, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator
from sqlalchemy.ext.compiler import compiles
import json

class SQLiteFriendlyVector(TypeDecorator):
    impl = String
    cache_ok = True
    
    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector
            return dialect.type_descriptor(Vector(384))
        else:
            return dialect.type_descriptor(String(2048))
            
    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if hasattr(value, "tolist"):
            value = value.tolist()
        if dialect.name == "postgresql":
            return value
        return json.dumps(value)
        
    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        try:
            return json.loads(value)
        except Exception:
            return value

class SQLiteFriendlyTSVector(TypeDecorator):
    impl = String
    cache_ok = True
    
    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import TSVECTOR
            return dialect.type_descriptor(TSVECTOR)
        else:
            return dialect.type_descriptor(String(512))

@compiles(Computed, "sqlite")
def compile_computed_sqlite(element, compiler, **kw):
    sql = str(element.sqltext)
    if "to_tsvector" in sql:
        return "GENERATED ALWAYS AS (coalesce(lyrics, '')) STORED"
    return f"GENERATED ALWAYS AS ({sql}) STORED"

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.album import Album
    from app.models.artist import Artist
    from app.models.playlist_track import PlaylistTrack

# Association table for tracks and multiple artists
track_artists = Table(
    "track_artists",
    Base.metadata,
    Column("track_id", Integer, ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True),
    Column("artist_id", Integer, ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True),
)


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    album_id: Mapped[int | None] = mapped_column(ForeignKey("albums.id"), nullable=True)
    artist_id: Mapped[int | None] = mapped_column(ForeignKey("artists.id", ondelete="CASCADE"), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(nullable=True)
    audio_file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cover_image_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    hls_playlist_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    hls_key_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    genres: Mapped[str | None] = mapped_column(String(512), nullable=True)
    lyrics: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(SQLiteFriendlyVector, nullable=True)
    search_tsv: Mapped[Any | None] = mapped_column(SQLiteFriendlyTSVector, nullable=True)
    lyrics_tsv: Mapped[Any | None] = mapped_column(
        SQLiteFriendlyTSVector,
        Computed(text("to_tsvector('english', coalesce(lyrics, ''))"), persisted=True),
        nullable=True
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)

    album: Mapped["Album | None"] = relationship(back_populates="tracks")
    artist_rel: Mapped["Artist | None"] = relationship(back_populates="standalone_tracks", foreign_keys=[artist_id])
    
    # Many-to-many relationship supporting multiple artists on a single track
    artists: Mapped[list["Artist"]] = relationship(
        secondary="track_artists",
        back_populates="tracks"
    )
    
    playlist_tracks: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="track",
        cascade="all, delete-orphan"
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
        if self.artists:
            return ", ".join(a.name for a in self.artists)
        if self.artist_rel:
            return self.artist_rel.name
        if self.album and self.album.artist:
            return self.album.artist.name
        return None

    @property
    def cover_url(self) -> str | None:
        from app.core.storage import get_audio_url
        if self.cover_image_key:
            url = get_audio_url(self.cover_image_key)
            if url and self.updated_at:
                ts = int(self.updated_at.timestamp())
                sep = "&" if "?" in url else "?"
                return f"{url}{sep}v={ts}"
            return url
        return self.album.cover_url if self.album else None
