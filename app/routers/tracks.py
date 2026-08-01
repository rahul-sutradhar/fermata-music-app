import re
from fastapi import APIRouter, Depends, File, Query, UploadFile, status, Request, HTTPException
from fastapi.responses import StreamingResponse, RedirectResponse, Response

from app.core.deps import CurrentUser, DbSession, CurrentArtistOrAdmin
from app.schemas.errors import ErrorResponse
from app.schemas.track import TrackCreate, TrackResponse, TrackUpdate
from app.services import tracks as track_service
from app.services.tracks import _to_response as _track_to_response, index_and_embed_track
from app.core.storage import get_b2_client
from app.core.config import settings
from app.models.track import Track

router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.get("", response_model=list[TrackResponse])
def list_tracks(
    db: DbSession,
    skip: int = Query(0, ge=0, description="Number of tracks to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum tracks to return"),
    q: str | None = Query(None, description="Filter tracks by title"),
) -> list[TrackResponse]:
    """List tracks with optional pagination and title search."""
    return track_service.list_tracks(db=db, skip=skip, limit=limit, q=q)


@router.post(
    "",
    response_model=TrackResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
    },
)
def create_track(
    payload: TrackCreate,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> TrackResponse:
    """Create a new track."""
    return track_service.create_track(db=db, payload=payload, user=current_user)


@router.get(
    "/{track_id}",
    response_model=TrackResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_track(track_id: int, db: DbSession) -> TrackResponse:
    """Return a single track by ID."""
    return track_service.get_track(db=db, track_id=track_id)


@router.post(
    "/{track_id}/audio",
    response_model=TrackResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def upload_track_audio(
    track_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
    file: UploadFile = File(...),
) -> TrackResponse:
    """Upload an audio file for an existing track."""
    return track_service.upload_track_audio(
        db=db,
        track_id=track_id,
        file=file,
        user=current_user,
    )


@router.get(
    "/{track_id}/audio",
    response_model=None,
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def get_track_audio_url(track_id: int, db: DbSession):
    """Return a signed URL for track playback.

    If the track is an HLS playlist whose key URI points to a stale domain,
    it returns a JSON response pointing to our local backend play.m3u8 proxy
    which handles real-time rewriting.
    """
    import re as _re
    import requests as _requests

    audio_url = track_service.get_track_audio_url(db=db, track_id=track_id)

    if audio_url and ".m3u8" in audio_url:
        current_base = settings.backend_url.rstrip("/")
        try:
            resp = _requests.get(audio_url, timeout=5)
            resp.raise_for_status()
            content = resp.text

            key_uris = _re.findall(r'URI="([^"]+)"', content)
            needs_rewrite = any(
                not uri.startswith(current_base) for uri in key_uris
            )

            if needs_rewrite:
                # Return a JSON pointing to our local proxy endpoint
                proxy_url = f"{current_base}/tracks/{track_id}/play.m3u8"
                return {"audio_url": proxy_url}

        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "M3U8 proxy check failed for track %s, falling back to direct URL: %s",
                track_id, exc,
            )

    return {"audio_url": audio_url}


@router.get(
    "/{track_id}/play.m3u8",
    response_class=Response,
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def get_rewritten_m3u8(track_id: int, db: DbSession):
    """Fetch the original HLS playlist from storage, rewrite its segment references
    to absolute CDN URLs, redirect key URI requests to the active backend, and stream.
    """
    import re as _re
    import requests as _requests

    audio_url = track_service.get_track_audio_url(db=db, track_id=track_id)
    if not audio_url:
        raise HTTPException(status_code=404, detail="Track audio not found")

    try:
        resp = _requests.get(audio_url, timeout=10)
        resp.raise_for_status()
        content = resp.text

        current_base = settings.backend_url.rstrip("/")
        base_url = audio_url.rsplit("/", 1)[0] + "/"

        def _rewrite_key_uri(m: _re.Match) -> str:
            uri_value = m.group(1)
            new_uri = f"{current_base}/tracks/{track_id}/key"
            return m.group(0).replace(uri_value, new_uri)

        lines = content.splitlines()
        rewritten_lines = []
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue
            if line_str.startswith("#"):
                if line_str.startswith("#EXT-X-KEY"):
                    line_str = _re.sub(r'URI="([^"]+)"', _rewrite_key_uri, line_str)
                rewritten_lines.append(line_str)
            else:
                if not (line_str.startswith("http://") or line_str.startswith("https://")):
                    line_str = f"{base_url}{line_str}"
                rewritten_lines.append(line_str)

        content = "\n".join(rewritten_lines)

        return Response(
            content=content,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to retrieve and proxy HLS playlist: {str(exc)}",
        )




@router.get(
    "/{track_id}/key",
    responses={404: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def get_track_hls_key(
    track_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    """Retrieve the HLS decryption key for a track, protected by authentication."""
    track = db.get(Track, track_id)
    if not track or not track.hls_key_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="HLS decryption key not found for this track",
        )

    try:
        client = get_b2_client()
        bucket_name = settings.b2_bucket_name
        response = client.get_object(Bucket=bucket_name, Key=track.hls_key_key)
        key_bytes = response["Body"].read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Key storage is temporarily unavailable: {str(exc)}",
        )

    return Response(content=key_bytes, media_type="application/octet-stream")


@router.get(
    "/{track_id}/audio/play",
    responses={
        307: {"description": "Redirects to direct presigned storage URL"},
        404: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def play_track_audio(
    track_id: int,
    db: DbSession,
):
    """Redirect to the presigned B2 storage URL directly to avoid proxying bandwidth."""
    audio_url = track_service.get_track_audio_url(db=db, track_id=track_id)
    return RedirectResponse(url=audio_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.patch(
    "/{track_id}",
    response_model=TrackResponse,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def update_track(
    track_id: int,
    payload: TrackUpdate,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
) -> TrackResponse:
    """Update an existing track."""
    return track_service.update_track(
        db=db, track_id=track_id, payload=payload, user=current_user
    )


@router.delete(
    "/{track_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def delete_track(track_id: int, db: DbSession, current_user: CurrentArtistOrAdmin) -> None:
    """Delete a track."""
    track_service.delete_track(db=db, track_id=track_id, user=current_user)


@router.post(
    "/{track_id}/cover",
    response_model=TrackResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def upload_track_cover(
    track_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
    file: UploadFile = File(...),
) -> TrackResponse:
    """Upload a cover image file for an existing track."""
    return track_service.upload_track_cover(
        db=db,
        track_id=track_id,
        file=file,
        user=current_user,
    )


# ── Re-indexing / Re-embedding endpoints ──────────────────────────────────────

@router.post(
    "/{track_id}/reindex",
    response_model=TrackResponse,
    responses={404: {"model": ErrorResponse}},
)
def reindex_track(track_id: int, db: DbSession, current_user: CurrentUser) -> TrackResponse:
    """
    Admin: Recompute search_tsv and embedding for a single track.
    Use this after changing the embedding model or fixing track metadata.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    index_and_embed_track(db, track)
    db.commit()
    db.refresh(track)
    return _track_to_response(track)


@router.post("/reindex-all", status_code=200)
def reindex_all_tracks(db: DbSession, current_user: CurrentUser) -> dict:
    """
    Admin: Recompute search_tsv and embeddings for every track in the database.
    Run this after switching embedding models.
    WARNING: Calls the HF API once per track and once per lyric chunk — may be slow.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    from sqlalchemy import select as sa_select
    tracks = db.scalars(sa_select(Track)).all()
    reindexed, failed = [], []
    for track in tracks:
        try:
            index_and_embed_track(db, track)
            reindexed.append(track.id)
        except Exception as e:
            failed.append({"id": track.id, "title": track.title, "error": str(e)})
    db.commit()
    return {"reindexed": reindexed, "failed": failed, "total": len(tracks)}


from pydantic import BaseModel

class LyricsFetchRequest(BaseModel):
    feedback: str | None = None
    youtube_url: str | None = None


@router.post(
    "/{track_id}/lyrics/fetch",
    response_model=TrackResponse,
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
)
def fetch_track_lyrics(
    track_id: int, 
    db: DbSession,
    current_user: CurrentUser,
    payload: LyricsFetchRequest | None = None,
) -> TrackResponse:
    """
    Actively fetch and persist lyrics for a track.
    Tries lrclib.net → lyrics.ovh → Mistral LLM as fallback.
    """
    import urllib.parse
    import requests as req_lib
    import logging

    logger = logging.getLogger(__name__)

    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    if track.lyrics and track.lyrics.strip():
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Lyrics are already available. Only administrators can refetch them."
            )

    song_name = track.title
    artist_name = track.artist_name or ""
    logger.info(f"[lyrics] Fetching lyrics for track_id={track_id} title={song_name!r} artist={artist_name!r}")

    feedback = payload.feedback if payload else None
    youtube_url = payload.youtube_url if payload else None

    from app.services.lyrics import fetch_lyrics_robustly

    lyrics = fetch_lyrics_robustly(
        song_name=song_name,
        artist_name=artist_name,
        album_title=track.album_title,
        duration_seconds=track.duration_seconds,
        genres=track.genres,
        youtube_url=youtube_url,
        feedback=feedback
    )

    if lyrics:
        track.lyrics = lyrics
        index_and_embed_track(db, track)
        db.commit()
        db.refresh(track)
        return _track_to_response(track)

    raise HTTPException(status_code=404, detail="Could not fetch lyrics from any available source.")


@router.post(
    "/{track_id}/lyrics/transliterate",
    response_model=dict,
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def transliterate_track_lyrics(track_id: int, db: DbSession) -> dict:
    """
    Transliterate native-script lyrics (Bengali, Hindi, Tamil, Telugu, etc.)
    to English phonetic alphabets using Mistral LLM.
    Returns the transliteration without modifying the stored lyrics.
    """
    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.lyrics or not track.lyrics.strip():
        raise HTTPException(status_code=422, detail="Track has no lyrics to transliterate.")

    if not settings.mistral_api_key:
        raise HTTPException(status_code=503, detail="Mistral API not configured for transliteration.")

    prompt = (
        "You are a phonetic transliteration assistant.\n"
        "Transliterate the following song lyrics from their native script (e.g., Bengali, Hindi, Tamil, Telugu, Kannada, Malayalam) "
        "into English alphabets that represent the same pronunciation as the original language.\n"
        "Do NOT translate the meaning. Do NOT change the structure or line breaks.\n"
        "If a line is already in English, leave it unchanged.\n"
        "Output ONLY the transliterated lyrics, nothing else.\n\n"
        f"Lyrics:\n{track.lyrics}"
    )

    import requests as req_lib
    import logging
    logger = logging.getLogger(__name__)

    try:
        from langchain_mistralai import ChatMistralAI
        from langchain_core.messages import HumanMessage
        llm = ChatMistralAI(model=settings.mistral_model, api_key=settings.mistral_api_key, temperature=0.1)
        response = llm.invoke([HumanMessage(content=prompt)])
        transliteration = response.content.strip()
        return {"track_id": track_id, "transliteration": transliteration}
    except Exception as e:
        logger.error(f"[transliterate][mistral] Exception: {e}")
        raise HTTPException(status_code=503, detail=f"Transliteration failed: {str(e)}")


# ── Autoplay Recommendation Endpoints ─────────────────────────────────────────

from fastapi import Header
from typing import Optional
from pydantic import BaseModel
from app.models.user import User

class AutoplayPayload(BaseModel):
    current_track_id: Optional[int] = None
    session_id: Optional[str] = None


def get_current_user_optional(
    db: DbSession,
    authorization: Optional[str] = Header(None)
) -> Optional[User]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        from datetime import datetime
        from app.core.oauth import hash_token
        from app.models.access_token import AccessToken
        from sqlalchemy import select
        
        token_hash = hash_token(token)
        token_obj = db.scalar(
            select(AccessToken).where(
                AccessToken.token_hash == token_hash,
                AccessToken.expires_at > datetime.utcnow()
            )
        )
        if token_obj is None:
            return None
        return db.scalar(select(User).where(User.id == token_obj.user_id))
    except Exception:
        return None


@router.post("/autoplay", response_model=TrackResponse)
def autoplay_next_track(
    payload: AutoplayPayload,
    db: DbSession,
    current_user: Optional[User] = Depends(get_current_user_optional)
) -> TrackResponse:
    """
    Suggest the next track to play based on the session's vibe vector,
    user genre affinity, and popularity, avoiding repeats.
    """
    from app.services.autoplay import get_next_autoplay_track
    user_id = current_user.id if current_user else None
    
    try:
        next_track = get_next_autoplay_track(
            db=db,
            current_track_id=payload.current_track_id,
            session_id=payload.session_id,
            user_id=user_id
        )
        return _track_to_response(next_track)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post(
    "/backfill-embeddings",
    response_model=dict,
    responses={403: {"model": ErrorResponse}},
)
def backfill_missing_embeddings(
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    """
    Admin-only: Find all tracks with missing embeddings and regenerate them.
    Runs synchronously and returns a summary of what was processed.
    """
    import logging
    logger = logging.getLogger(__name__)

    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can trigger embedding backfill.",
        )

    tracks_missing = db.scalars(
        __import__("sqlalchemy").select(Track).where(Track.embedding.is_(None))
    ).all()

    processed = []
    failed = []

    for track in tracks_missing:
        try:
            index_and_embed_track(db, track)
            db.commit()
            processed.append({"id": track.id, "title": track.title})
            logger.info(f"[Backfill] Embedded track {track.id}: '{track.title}'")
        except Exception as e:
            failed.append({"id": track.id, "title": track.title, "error": str(e)})
            logger.error(f"[Backfill] Failed track {track.id}: {e}")

    return {
        "processed": len(processed),
        "failed": len(failed),
        "tracks": processed,
        "errors": failed,
    }
