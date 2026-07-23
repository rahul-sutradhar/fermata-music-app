from pydantic import BaseModel, EmailStr, Field


class UserStub(BaseModel):
    id: int = Field(gt=0)
    username: str = Field(min_length=1, max_length=50)


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


from datetime import datetime

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str | None = None
    role: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True



class TopItemResponse(BaseModel):
    """Top artist or track response."""

    id: int
    name: str
    type: str  # "artist" or "track"

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"

    class Config:
        from_attributes = True


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., description="Refresh token to exchange for new access token")


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="user", pattern="^(user|artist|admin)$")


class AdminUserUpdate(BaseModel):
    username: str | None = Field(None, min_length=1, max_length=50)
    email: EmailStr | None = None
    role: str | None = Field(None, pattern="^(user|artist|admin)$")
    password: str | None = Field(None, min_length=8, max_length=128)
