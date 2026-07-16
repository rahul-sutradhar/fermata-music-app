"""Library router (user liked tracks)."""

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.errors import ErrorResponse
from app.schemas.library import LibraryItemResponse
from app.services import library as library_service

router = APIRouter(prefix="/me/library", tags=["library"])


@router.get(
    "",
    response_model=list[LibraryItemResponse],
    responses={401: {"model": ErrorResponse}},
)
def get_my_library(
    db: DbSession,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[LibraryItemResponse]:
    """Get current user's liked tracks library."""
    items = library_service.get_user_library(db, current_user.id, skip, limit)
    return [LibraryItemResponse.model_validate(item) for item in items]


@router.put(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def add_to_library(
    db: DbSession,
    current_user: CurrentUser,
    track_ids: list[int] = Query(..., description="Track IDs to add to library"),
) -> None:
    """Add tracks to current user's library."""
    for track_id in track_ids:
        library_service.add_to_library(db, current_user.id, track_id)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def remove_from_library(
    db: DbSession,
    current_user: CurrentUser,
    track_ids: list[int] = Query(..., description="Track IDs to remove from library"),
) -> None:
    """Remove tracks from current user's library."""
    for track_id in track_ids:
        library_service.remove_from_library(db, current_user.id, track_id)


@router.get(
    "/contains",
    responses={
        401: {"model": ErrorResponse},
    },
)
def check_in_library(
    db: DbSession,
    current_user: CurrentUser,
    track_ids: list[int] = Query(..., description="Track IDs to check"),
) -> dict[int, bool]:
    """Check if tracks are in current user's library."""
    return library_service.contains_in_library(db, current_user.id, track_ids)
