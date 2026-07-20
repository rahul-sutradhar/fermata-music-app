from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.user import User

class Admin(User):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    __mapper_args__ = {
        "polymorphic_identity": "admin",
    }
