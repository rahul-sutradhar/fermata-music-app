from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.deps import CurrentArtistOrAdmin, DbSession
from app.core.storage import generate_presigned_put_url
from app.services import tracks as track_service

router = APIRouter(prefix="/uploads", tags=["uploads"])


class PresignRequest(BaseModel):
    key: str
    content_type: str | None = None
    expires_in: int | None = 300


class ConfirmTrackRequest(BaseModel):
    track_id: int
    key: str


@router.post("/presign")
def presign_upload(payload: PresignRequest):
    """Return a presigned PUT URL for uploading directly to Backblaze B2 (S3-compatible).

    The client should then perform a PUT to the returned URL with the file bytes and
    the matching Content-Type. The application should store the `key` in its model
    after successful upload.
    """
    url = generate_presigned_put_url(payload.key, expires_in=payload.expires_in or 300, content_type=payload.content_type)
    if not url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to generate presigned URL")
    return {"url": url, "key": payload.key}


@router.post("/confirm-track")
def confirm_track_upload(payload: ConfirmTrackRequest, db: DbSession, current_user: CurrentArtistOrAdmin):
    """Confirm that a direct upload was performed and associate the object key with a track."""
    try:
        return track_service.set_track_audio_key(db=db, track_id=payload.track_id, object_key=payload.key, user=current_user)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - bubble unknown errors as 503
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
