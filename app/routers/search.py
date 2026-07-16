from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.schemas.search import SearchResponse
from app.services import search as search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
def search(db: DbSession, q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=50)):
    """Search for tracks, albums, and artists by title/name."""
    result = search_service.search(db=db, q=q, limit=limit)
    return result.model_dump()
