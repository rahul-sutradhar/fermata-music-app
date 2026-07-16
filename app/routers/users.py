"""User profile and top items router."""

from sqlalchemy import select

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, CurrentAdmin, DbSession
from app.core.oauth import hash_password
from app.models import Artist, Track
from app.models.user import User
from app.schemas.errors import ErrorResponse
from app.schemas.user import AdminUserCreate, AdminUserUpdate, TopItemResponse, UserResponse

router = APIRouter(tags=["users"])


@router.get(
    "/me",
    response_model=UserResponse,
    responses={401: {"model": ErrorResponse}},
)
def get_current_user_profile(current_user: CurrentUser) -> UserResponse:
    """Get current user's profile."""
    return UserResponse(
        id=current_user.id, username=current_user.username, email=current_user.email, role=current_user.role
    )


@router.get(
    "/me/top/{item_type}",
    response_model=list[TopItemResponse],
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
    },
)
def get_top_items(
    db: DbSession,
    current_user: CurrentUser,
    item_type: str,
    time_range: str = Query("medium_term", description="'short_term', 'medium_term', or 'long_term'"),
    limit: int = Query(20, ge=1, le=50),
) -> list[TopItemResponse]:
    """Get user's top artists or tracks.
    
    Currently returns most frequently created/interacted items of the given type.
    """
    if item_type not in ["artists", "tracks"]:
        raise HTTPException(status_code=400, detail="item_type must be 'artists' or 'tracks'")

    if item_type == "artists":
        # Return top artists
        artists = db.scalars(select(Artist).limit(limit)).all()
        return [
            TopItemResponse(id=a.id, name=a.name, type="artist") for a in artists
        ]
    else:
        # Return top tracks
        tracks = db.scalars(select(Track).limit(limit)).all()
        return [
            TopItemResponse(id=t.id, name=t.title, type="track") for t in tracks
        ]


# ---- Admin User Management ----


@router.get(
    "/admin/users",
    response_model=list[UserResponse],
    responses={403: {"model": ErrorResponse}},
)
def list_users(
    db: DbSession,
    current_user: CurrentAdmin,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
) -> list[UserResponse]:
    """List all users (Admin only)."""
    users = db.scalars(select(User).order_by(User.id).offset(skip).limit(limit)).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post(
    "/admin/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def admin_create_user(
    payload: AdminUserCreate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> UserResponse:
    """Create a user with a specific role (Admin only)."""
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch(
    "/admin/users/{user_id}",
    response_model=UserResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: DbSession,
    current_user: CurrentAdmin,
) -> UserResponse:
    """Update a user's info (Admin only)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")

    if payload.username is not None:
        existing = db.scalar(select(User).where(User.username == payload.username, User.id != user_id))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        user.username = payload.username
    if payload.email is not None:
        existing = db.scalar(select(User).where(User.email == payload.email, User.id != user_id))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        user.email = payload.email
    if payload.role is not None:
        user.role = payload.role

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete(
    "/admin/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_delete_user(
    user_id: int,
    db: DbSession,
    current_user: CurrentAdmin,
) -> None:
    """Delete a user (Admin only). Cannot delete yourself."""
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")
    db.delete(user)
    db.commit()

