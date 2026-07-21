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
    is_master_admin = (current_user.username == "admin" or current_user.id == 1)

    if payload.role == "admin" and not is_master_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the master admin can create admin accounts",
        )

    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if payload.role == "admin":
        from app.models.admin import Admin
        user = Admin(
            username=payload.username,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            role="admin",
            name=payload.username,
        )
    elif payload.role == "artist":
        from app.models.artist import Artist
        user = Artist(
            username=payload.username,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            role="artist",
            name=payload.username,
        )
    else:
        user = User(
            username=payload.username,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            role="user",
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

    is_master_admin = (current_user.username == "admin" or current_user.id == 1)

    # 1. Master admin account is 100% read-only for everyone
    if user.username == "admin" or user_id == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The master admin account is 100% read-only and cannot be modified."
        )

    # 2. Non-master admins cannot modify details of other admin accounts
    if not is_master_admin and user.role == "admin" and user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrators cannot modify details of other admin accounts."
        )

    # Permission checks for non-master admins promoting/demoting users
    if payload.role is not None and payload.role != user.role:
        if not is_master_admin:
            if payload.role == "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the master admin can promote users to admin",
                )
            if user.role == "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the master admin can change the role of administrators",
                )

    # Prevent admin from changing their own role
    if payload.role is not None and payload.role != user.role and user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own administrator role"
        )


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
        
    if payload.role is not None and payload.role != user.role:
        from sqlalchemy import text
        # If demoting from old subclass, delete from subclass tables
        if user.role == "admin":
            db.execute(text("DELETE FROM admins WHERE id = :id"), {"id": user_id})
        elif user.role == "artist":
            # Check if they have albums
            from app.models.album import Album
            has_albums = db.scalar(select(Album).where(Album.artist_id == user_id).limit(1)) is not None
            if has_albums:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot demote artist: this artist has active albums or tracks. Please delete their music first."
                )
            db.execute(text("DELETE FROM artists WHERE id = :id"), {"id": user_id})
            
        # If promoting to new subclass, insert into subclass tables
        if payload.role == "admin":
            db.execute(text("INSERT INTO admins (id, name) VALUES (:id, :name)"), {"id": user_id, "name": user.username})
        elif payload.role == "artist":
            db.execute(text("INSERT INTO artists (id, name) VALUES (:id, :name)"), {"id": user_id, "name": user.username})
            
        # Flush any other pending updates (e.g. username, email) before role modification
        db.flush()
        
        # Update the role discriminator column directly in the database to prevent ORM class mismatch on commit
        db.execute(text("UPDATE users SET role = :role WHERE id = :id"), {"role": payload.role, "id": user_id})
        
        # Expunge the old cached Python object from the session before committing
        db.expunge(user)
        db.commit()
        
        # Re-fetch so SQLAlchemy builds a clean Python object of the new subclass type (Admin/Artist/User)
        user = db.get(User, user_id)
    else:
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

    is_master_admin = (current_user.username == "admin" or current_user.id == 1)

    # Protection for master admin
    if user.username == "admin" or user_id == 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the master admin")

    # Only master admin can delete standard admins
    if user.role == "admin" and not is_master_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the master admin can delete administrator accounts",
        )

    # Protection for deleting active catalog artists
    if user.role == "artist":
        from app.models.album import Album
        has_albums = db.scalar(select(Album).where(Album.artist_id == user_id).limit(1)) is not None
        if has_albums:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete artist: this artist has active albums or tracks. Please delete their music first."
            )

    db.delete(user)
    db.commit()


