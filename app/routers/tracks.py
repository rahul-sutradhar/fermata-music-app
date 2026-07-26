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
    response_model=dict,
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def get_track_audio_url(track_id: int, db: DbSession) -> dict:
    """Return a signed URL for track playback."""
    return {"audio_url": track_service.get_track_audio_url(db=db, track_id=track_id)}


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


@router.post(
    "/{track_id}/lyrics/fetch",
    response_model=TrackResponse,
    responses={404: {"model": ErrorResponse}},
)
def fetch_track_lyrics(track_id: int, db: DbSession) -> TrackResponse:
    """
    Actively fetch and persist lyrics for a track that currently has none.
    Tries lrclib.net → lyrics.ovh → Mistral LLM as fallback.
    """
    import urllib.parse
    import requests as req_lib
    import logging

    logger = logging.getLogger(__name__)

    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    song_name = track.title
    artist_name = track.artist_name or ""
    logger.info(f"[lyrics] Fetching lyrics for track_id={track_id} title={song_name!r} artist={artist_name!r}")

    # --- Tier 1: lrclib.net ---
    try:
        # Build candidate artists list to try in sequence
        artists_to_try = [artist_name]
        primary_artist = ""
        if "," in artist_name or "feat" in artist_name.lower() or "ft" in artist_name.lower():
            import re
            parts = re.split(r',|feat\b|ft\b', artist_name, flags=re.IGNORECASE)
            primary_artist = parts[0].strip()
            if primary_artist and primary_artist != artist_name:
                artists_to_try.append(primary_artist)
        else:
            primary_artist = artist_name

        plain_lyrics = None

        # 1. Try exact match lookups
        for artist in artists_to_try:
            params = {"track_name": song_name}
            if artist:
                params["artist_name"] = artist
            
            logger.info(f"[lyrics][lrclib] Trying exact match for title={song_name!r} artist={artist!r}")
            r = req_lib.get(
                "https://lrclib.net/api/get",
                params=params,
                headers={"User-Agent": "FermataApp/1.0"},
                timeout=8,
            )
            if r.status_code == 200:
                plain_lyrics = (r.json().get("plainLyrics") or "").strip()
                if plain_lyrics:
                    logger.info("[lyrics][lrclib] Found exact lyrics match.")
                    break

        # 2. Try fuzzy search fallback if exact fails
        if not plain_lyrics and primary_artist:
            search_query = f"{song_name} {primary_artist}"
            logger.info(f"[lyrics][lrclib] Exact match failed. Trying fuzzy search for query={search_query!r}")
            r_search = req_lib.get(
                "https://lrclib.net/api/search",
                params={"q": search_query},
                headers={"User-Agent": "FermataApp/1.0"},
                timeout=8,
            )
            if r_search.status_code == 200:
                results = r_search.json()
                for res in results:
                    plain_lyrics = (res.get("plainLyrics") or "").strip()
                    if plain_lyrics:
                        logger.info(f"[lyrics][lrclib] Found search lyrics match from title='{res.get('name')}' artist='{res.get('artistName')}'")
                        break



        if plain_lyrics:
            track.lyrics = plain_lyrics
            index_and_embed_track(db, track)
            db.commit()
            db.refresh(track)
            return _track_to_response(track)

    except Exception as e:
        logger.warning(f"[lyrics][lrclib] Exception: {e}")

    # --- Tier 2: Mistral LLM ---
    if settings.mistral_api_key:
        try:
            from langchain_mistralai import ChatMistralAI
            from langchain_core.messages import HumanMessage
            llm = ChatMistralAI(model=settings.mistral_model, api_key=settings.mistral_api_key, temperature=0.1)
            prompt = (
                f"Retrieve the complete and accurate lyrics for the song '{song_name}' by '{artist_name}'.\n"
                "Output ONLY the lyrics — no introductory text, no explanations, no chords.\n"
                "Keep section headers like [Verse 1], [Chorus], [Bridge] if present.\n"
                "If you cannot find the lyrics with certainty, reply with exactly: Lyrics not found."
            )
            response = llm.invoke([HumanMessage(content=prompt)])
            result = response.content.strip()
            logger.info(f"[lyrics][llm] LLM responded ({len(result)} chars)")
            if result and "lyrics not found" not in result.lower():
                track.lyrics = result
                index_and_embed_track(db, track)
                db.commit()
                db.refresh(track)
                return _track_to_response(track)
        except Exception as e:
            logger.error(f"[lyrics][llm] Exception: {e}")
    else:
        logger.info("[lyrics][llm] Skipping LLM tier — MISTRAL_API_KEY not set in settings.")

    # --- Tier 3: Gemini LLM ---
    if settings.gemini_api_key:
        try:
            logger.info(f"[lyrics][gemini] Querying Gemini for lyrics: '{song_name}' by '{artist_name}'...")
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
            prompt = (
                f"You are a music cataloging assistant. Retrieve the complete and accurate lyrics for the song '{song_name}' by '{artist_name}'.\n\n"
                "Constraints:\n"
                "- Output ONLY the lyrics. Do not add introductory sentences, structural metadata commentary, notes, or explanations.\n"
                "- Do not include guitar chords or piano symbols within the lyrics lines.\n"
                "- Keep structural separators like [Verse 1], [Chorus], [Bridge] clean.\n"
                "- If you cannot find or reconstruct the lyrics with 100% certainty, reply with exactly: Lyrics not found."
            )
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
            res = req_lib.post(gemini_url, json=payload, timeout=12)
            if res.status_code == 200:
                res_data = res.json()
                candidates = res_data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        result = parts[0].get("text", "").strip()
                        logger.info(f"[lyrics][gemini] Gemini responded ({len(result)} chars)")
                        if result and "lyrics not found" not in result.lower():
                            track.lyrics = result
                            index_and_embed_track(db, track)
                            db.commit()
                            db.refresh(track)
                            return _track_to_response(track)
            else:
                logger.error(f"[lyrics][gemini] API error {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"[lyrics][gemini] Exception: {e}")

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

    if not settings.mistral_api_key and not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Neither Mistral nor Gemini APIs configured for transliteration.")

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

    if settings.mistral_api_key:
        try:
            from langchain_mistralai import ChatMistralAI
            from langchain_core.messages import HumanMessage
            llm = ChatMistralAI(model=settings.mistral_model, api_key=settings.mistral_api_key, temperature=0.1)
            response = llm.invoke([HumanMessage(content=prompt)])
            transliteration = response.content.strip()
            return {"track_id": track_id, "transliteration": transliteration}
        except Exception as e:
            logger.error(f"[transliterate][mistral] Exception: {e}")

    if settings.gemini_api_key:
        try:
            logger.info(f"[transliterate][gemini] Requesting transliteration from Gemini model: {settings.gemini_model}...")
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
            res = req_lib.post(gemini_url, json=payload, timeout=15)
            if res.status_code == 200:
                res_data = res.json()
                candidates = res_data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        transliteration = parts[0].get("text", "").strip()
                        return {"track_id": track_id, "transliteration": transliteration}
            raise RuntimeError(f"Gemini API returned status {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"[transliterate][gemini] Exception: {e}")

    raise HTTPException(status_code=503, detail="Transliteration failed via all configured providers.")
