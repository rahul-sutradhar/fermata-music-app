import re
from fastapi import APIRouter, Depends, File, Query, UploadFile, status, Request, HTTPException
from fastapi.responses import StreamingResponse, RedirectResponse

from app.core.deps import CurrentUser, DbSession, CurrentArtistOrAdmin
from app.schemas.errors import ErrorResponse
from app.schemas.track import TrackCreate, TrackResponse, TrackUpdate
from app.services import tracks as track_service
from app.services.tracks import _to_response as _track_to_response
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


@router.post(
    "/{track_id}/lyrics/fetch",
    response_model=TrackResponse,
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def fetch_track_lyrics(track_id: int, db: DbSession) -> TrackResponse:
    """
    Actively fetch and persist lyrics for a track that currently has none.
    Tries lrclib.net → lyrics.ovh → Mistral LLM as fallback.
    """
    import urllib.parse
    import requests as req_lib

    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    song_name = track.title
    artist_name = track.artist_name or ""

    # --- Tier 1: lrclib.net ---
    try:
        params = {"track_name": song_name, "artist_name": artist_name}
        r = req_lib.get(
            "https://lrclib.net/api/get",
            params=params,
            headers={"User-Agent": "FermataApp/1.0"},
            timeout=8,
        )
        if r.status_code == 200:
            plain = (r.json().get("plainLyrics") or "").strip()
            if plain:
                track.lyrics = plain
                db.commit()
                db.refresh(track)
                return _track_to_response(track)
    except Exception:
        pass

    # --- Tier 2: lyrics.ovh ---
    try:
        url = f"https://api.lyrics.ovh/v1/{urllib.parse.quote(artist_name)}/{urllib.parse.quote(song_name)}"
        r = req_lib.get(url, timeout=8)
        if r.status_code == 200:
            lyrics = (r.json().get("lyrics") or "").strip()
            if lyrics:
                track.lyrics = lyrics
                db.commit()
                db.refresh(track)
                return _track_to_response(track)
    except Exception:
        pass

    # --- Tier 3: Mistral LLM ---
    mistral_key = settings.MISTRAL_API_KEY if hasattr(settings, "MISTRAL_API_KEY") else None
    if mistral_key:
        try:
            from langchain_mistralai import ChatMistralAI
            from langchain_core.messages import HumanMessage
            import os
            llm = ChatMistralAI(model=os.getenv("MISTRAL_MODEL", "mistral-large-latest"), temperature=0.1)
            prompt = (
                f"Retrieve the complete and accurate lyrics for the song '{song_name}' by '{artist_name}'.\n"
                "Output ONLY the lyrics — no introductory text, no explanations, no chords.\n"
                "Keep section headers like [Verse 1], [Chorus], [Bridge] if present.\n"
                "If you cannot find the lyrics with certainty, reply with exactly: Lyrics not found."
            )
            response = llm.invoke([HumanMessage(content=prompt)])
            result = response.content.strip()
            if result and "lyrics not found" not in result.lower():
                track.lyrics = result
                db.commit()
                db.refresh(track)
                return _track_to_response(track)
        except Exception:
            pass

    raise HTTPException(status_code=503, detail="Could not fetch lyrics from any available source.")


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

    mistral_key = settings.MISTRAL_API_KEY if hasattr(settings, "MISTRAL_API_KEY") else None
    if not mistral_key:
        raise HTTPException(status_code=503, detail="Mistral API not configured for transliteration.")

    try:
        from langchain_mistralai import ChatMistralAI
        from langchain_core.messages import HumanMessage
        import os
        llm = ChatMistralAI(model=os.getenv("MISTRAL_MODEL", "mistral-large-latest"), temperature=0.1)
        prompt = (
            "You are a phonetic transliteration assistant.\n"
            "Transliterate the following song lyrics from their native script (e.g., Bengali, Hindi, Tamil, Telugu, Kannada, Malayalam) "
            "into English alphabets that represent the same pronunciation as the original language.\n"
            "Do NOT translate the meaning. Do NOT change the structure or line breaks.\n"
            "If a line is already in English, leave it unchanged.\n"
            "Output ONLY the transliterated lyrics, nothing else.\n\n"
            f"Lyrics:\n{track.lyrics}"
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        transliteration = response.content.strip()
        return {"track_id": track_id, "transliteration": transliteration}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Transliteration failed: {str(e)}")
