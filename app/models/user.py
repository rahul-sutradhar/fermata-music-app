from datetime import datetime
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)

    __mapper_args__ = {
        "polymorphic_on": "role",
        "polymorphic_identity": "user",
    }

    playlists: Mapped[list["Playlist"]] = relationship(back_populates="owner")
    library: Mapped[list["UserLibrary"]] = relationship(
        "UserLibrary", back_populates="user", cascade="all, delete-orphan"
    )
    player_state: Mapped["PlayerState"] = relationship(
        "PlayerState", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    recently_played: Mapped[list["RecentlyPlayed"]] = relationship(
        "RecentlyPlayed", back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )
