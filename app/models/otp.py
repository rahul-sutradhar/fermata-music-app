from datetime import datetime
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserOTP(Base):
    """Stores one-time verification and reset codes sent to users."""

    __tablename__ = "user_otp"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    otp_code: Mapped[str] = mapped_column(String(10), nullable=False)
    otp_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "email_verification" or "password_reset"
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)

    # Relationship to user
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<UserOTP user_id={self.user_id} type={self.otp_type} expires_at={self.expires_at}>"
