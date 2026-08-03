from datetime import datetime
import hashlib
import os
import shutil
import tempfile
import uuid
import json
import base64
import subprocess
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import DbSession, CurrentArtistOrAdmin, CurrentUser
from app.core.storage import get_b2_client, get_audio_url, upload_local_file, delete_audio_file
from app.core.hls import transcode_to_hls
from app.models.draft import Draft
from app.models.track_backup import TrackBackup
from app.models.track import Track
from app.models.album import Album
from app.services.tracks import index_and_embed_track

router = APIRouter(prefix="/studio", tags=["studio"])

# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class DraftResponse(BaseModel):
    id: int
    title: str
    backing_track_id: Optional[int] = None
    backing_file_key: Optional[str] = None
    is_split: bool
    mix_volumes: dict
    vocal_url: Optional[str] = None
    split_vocals_url: Optional[str] = None
    split_drums_url: Optional[str] = None
    split_bass_url: Optional[str] = None
    split_other_url: Optional[str] = None
    split_guitar_url: Optional[str] = None
    split_piano_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DraftUpdatePayload(BaseModel):
    title: Optional[str] = None
    backing_track_id: Optional[int] = None
    backing_file_key: Optional[str] = None
    is_split: Optional[bool] = None
    split_vocals_key: Optional[str] = None
    split_drums_key: Optional[str] = None
    split_bass_key: Optional[str] = None
    split_other_key: Optional[str] = None
    split_guitar_key: Optional[str] = None
    split_piano_key: Optional[str] = None
    mix_volumes: Optional[dict] = None

# ── Split Helper Functions ───────────────────────────────────────────────────

STEM_NAMES = ["vocals", "drums", "bass", "other", "guitar", "piano"]

def _layer_keys_for_prefix(prefix: str) -> dict:
    """Build the deterministic B2 object keys for all 6 stems under a given prefix (htdemucs_6s)."""
    return {
        "vocals": f"{prefix}/vocals.mp3",
        "drums":  f"{prefix}/drums.mp3",
        "bass":   f"{prefix}/bass.mp3",
        "other":  f"{prefix}/music.mp3",
        "guitar": f"{prefix}/guitar.mp3",
        "piano":  f"{prefix}/piano.mp3",
    }

def _all_layers_exist(client, bucket: str, keys: dict) -> bool:
    """Return True only when every stem object already exists in B2."""
    for key in keys.values():
        try:
            client.head_object(Bucket=bucket, Key=key)
        except Exception:
            return False
    return True

def generate_mock_split(original_key: Optional[str], client) -> dict:
    """Fallback mock separation that returns the original audio file bytes for all layers."""
    if not original_key:
        raise HTTPException(status_code=400, detail="Cannot perform mock split: no backing audio found.")
    
    try:
        response = client.get_object(Bucket=settings.b2_bucket_name, Key=original_key)
        raw_bytes = response["Body"].read()
        b64_str = base64.b64encode(raw_bytes).decode("utf-8")
        return {
            "vocals": b64_str,
            "drums": b64_str,
            "bass": b64_str,
            "other": b64_str
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to fetch original audio for mock split: {str(e)}")

def save_split_layers_to_b2(split_result: dict, prefix: str) -> dict:
    """
    Saves the base64-encoded layers returned by Modal/Demucs into Backblaze B2
    under a *deterministic* prefix so the same split is never re-computed.
    """
    client = get_b2_client()
    bucket_name = settings.b2_bucket_name
    keys = _layer_keys_for_prefix(prefix)
    
    for stem_name, key in keys.items():
        try:
            file_bytes = base64.b64decode(split_result[stem_name])
            client.put_object(
                Bucket=bucket_name,
                Key=key,
                Body=file_bytes,
                ContentType="audio/mpeg"
            )
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to upload split layer {stem_name} to B2: {str(e)}")
            
    return keys

# ── API Routes ───────────────────────────────────────────────────────────────

@router.post("/split-app-track/{track_id}")
def split_app_track(
    track_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin
) -> dict:
    """
    Split an app-library track into 4 stems via Demucs/Modal.

    CDN-cache strategy
    ------------------
    Layers are stored under a **deterministic** B2 key prefix:
      ``studio/layers/track_{track_id}/``
    Before invoking Demucs we check whether all 4 objects already exist.
    If they do, we short-circuit and return the existing CDN URLs — Demucs
    is *never* called twice for the same track.  The CDN (pull-through) will
    serve the files from its edge cache on subsequent requests.
    """
    track = db.get(Track, track_id)
    if not track or not track.hls_playlist_key or not track.hls_key_key:
        raise HTTPException(status_code=404, detail="Track is not HLS transcoded or does not exist")
        
    client = get_b2_client()
    bucket_name = settings.b2_bucket_name

    # ── 1. Cache hit: layers already exist in B2 / CDN ──────────────────────
    cache_prefix = f"studio/layers/track_{track_id}"
    layer_keys = _layer_keys_for_prefix(cache_prefix)

    if _all_layers_exist(client, bucket_name, layer_keys):
        print(f"[Studio] Cache hit for track {track_id} — returning existing CDN layers.", flush=True)
        return {
            "is_split": True,
            "split_vocals_key": layer_keys["vocals"],
            "split_vocals_url": get_audio_url(layer_keys["vocals"]),
            "split_drums_key": layer_keys["drums"],
            "split_drums_url": get_audio_url(layer_keys["drums"]),
            "split_bass_key": layer_keys["bass"],
            "split_bass_url": get_audio_url(layer_keys["bass"]),
            "split_other_key": layer_keys["other"],
            "split_other_url": get_audio_url(layer_keys["other"]),
        }

    # ── 2. Cache miss: fetch HLS assets and run Demucs ───────────────────────
    try:
        key_resp = client.get_object(Bucket=bucket_name, Key=track.hls_key_key)
        key_bytes = key_resp["Body"].read()

        playlist_resp = client.get_object(Bucket=bucket_name, Key=track.hls_playlist_key)
        playlist_content = playlist_resp["Body"].read().decode("utf-8")
        
        segments = []
        base_hls_path = track.hls_playlist_key.rsplit("/", 1)[0]
        
        for line in playlist_content.splitlines():
            line_str = line.strip()
            if line_str and not line_str.startswith("#"):
                segment_key = f"{base_hls_path}/{line_str}"
                seg_resp = client.get_object(Bucket=bucket_name, Key=segment_key)
                seg_bytes = seg_resp["Body"].read()
                segments.append({
                    "name": line_str,
                    "data_b64": base64.b64encode(seg_bytes).decode("utf-8")
                })
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to read HLS track assets from B2: {str(exc)}")

    split_res = None
    try:
        import modal
        # Use htdemucs_6s model for 6-stem separation
        f = modal.Function.from_name("demucs-splitter", "decrypt_and_split_hls")
        split_res = f.remote(segments, key_bytes, model="htdemucs_6s")
    except Exception as modal_err:
        print(f"[Studio backend] Modal separation unavailable, running fallback: {modal_err}", flush=True)
        split_res = generate_mock_split(track.audio_file_key, client)

    # ── 3. Save under deterministic prefix so next call is a cache hit ───────
    layer_keys = save_split_layers_to_b2(split_res, cache_prefix)
    
    return {
        "is_split": True,
        "split_vocals_key": layer_keys["vocals"],
        "split_vocals_url": get_audio_url(layer_keys["vocals"]),
        "split_drums_key": layer_keys["drums"],
        "split_drums_url": get_audio_url(layer_keys["drums"]),
        "split_bass_key": layer_keys["bass"],
        "split_bass_url": get_audio_url(layer_keys["bass"]),
        "split_other_key": layer_keys["other"],
        "split_other_url": get_audio_url(layer_keys["other"]),
        "split_guitar_key": layer_keys["guitar"],
        "split_guitar_url": get_audio_url(layer_keys["guitar"]),
        "split_piano_key": layer_keys["piano"],
        "split_piano_url": get_audio_url(layer_keys["piano"]),
    }


@router.post("/split-external-track")
def split_external_track(
    current_user: CurrentArtistOrAdmin,
    file: UploadFile = File(...)
) -> dict:
    """
    Split an externally uploaded audio file into 4 stems via Demucs/Modal.

    CDN-cache strategy
    ------------------
    The SHA-256 hash of the uploaded file bytes is used as the deterministic
    B2 key prefix:  ``studio/layers/ext_{sha256_hex}/``
    If the same file was uploaded and split before, we short-circuit and
    return the existing CDN URLs without re-running Demucs.
    """
    try:
        file_bytes = file.file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {str(e)}")

    client = get_b2_client()
    bucket_name = settings.b2_bucket_name

    # ── 1. Deterministic cache prefix from file content hash ─────────────────
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    cache_prefix = f"studio/layers/ext_{file_hash}"
    layer_keys = _layer_keys_for_prefix(cache_prefix)

    # ── 2. Cache hit: all stems already present in B2 / CDN ──────────────────
    if _all_layers_exist(client, bucket_name, layer_keys):
        print(f"[Studio] Cache hit for external file hash {file_hash[:12]}… — returning existing CDN layers.", flush=True)
        # Locate existing backing track key (may have been uploaded previously)
        backing_key = f"studio/temp_backing/ext_{file_hash}/{file.filename}"
        return {
            "is_split": True,
            "backing_file_key": backing_key,
            "split_vocals_key": layer_keys["vocals"],
            "split_vocals_url": get_audio_url(layer_keys["vocals"]),
            "split_drums_key": layer_keys["drums"],
            "split_drums_url": get_audio_url(layer_keys["drums"]),
            "split_bass_key": layer_keys["bass"],
            "split_bass_url": get_audio_url(layer_keys["bass"]),
            "split_other_key": layer_keys["other"],
            "split_other_url": get_audio_url(layer_keys["other"]),
        }

    # ── 3. Cache miss: run Demucs (htdemucs_6s) ──────────────────────────────
    split_res = None
    try:
        import modal
        f = modal.Function.from_name("demucs-splitter", "split_audio")
        split_res = f.remote(file_bytes, file.filename, model="htdemucs_6s")
    except Exception as modal_err:
        print(f"[Studio backend] Modal separation unavailable, running fallback: {modal_err}", flush=True)
        b64_raw = base64.b64encode(file_bytes).decode("utf-8")
        split_res = {
            "vocals": b64_raw,
            "drums": b64_raw,
            "bass": b64_raw,
            "other": b64_raw,
            "guitar": b64_raw,
            "piano": b64_raw,
        }

    # ── 4. Persist layers under deterministic prefix ──────────────────────────
    layer_keys = save_split_layers_to_b2(split_res, cache_prefix)

    # ── 5. Persist backing track under a deterministic path too ──────────────
    backing_key = f"studio/temp_backing/ext_{file_hash}/{file.filename}"
    try:
        client.put_object(
            Bucket=bucket_name,
            Key=backing_key,
            Body=file_bytes,
            ContentType=file.content_type or "audio/mpeg"
        )
    except Exception as b2_err:
        print(f"[Studio Warning] Failed to upload temporary backing track to B2: {b2_err}")

    return {
        "is_split": True,
        "backing_file_key": backing_key,
        "split_vocals_key": layer_keys["vocals"],
        "split_vocals_url": get_audio_url(layer_keys["vocals"]),
        "split_drums_key": layer_keys["drums"],
        "split_drums_url": get_audio_url(layer_keys["drums"]),
        "split_bass_key": layer_keys["bass"],
        "split_bass_url": get_audio_url(layer_keys["bass"]),
        "split_other_key": layer_keys["other"],
        "split_other_url": get_audio_url(layer_keys["other"]),
        "split_guitar_key": layer_keys["guitar"],
        "split_guitar_url": get_audio_url(layer_keys["guitar"]),
        "split_piano_key": layer_keys["piano"],
        "split_piano_url": get_audio_url(layer_keys["piano"]),
    }


def extract_b2_key(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    if val.startswith("http://") or val.startswith("https://"):
        for prefix in ["studio/", "tracks/", "drafts/"]:
            idx = val.find(prefix)
            if idx != -1:
                return val[idx:]
    return val


@router.post("/drafts")
def save_draft(
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
    title: str = Form("Draft Recording"),
    backing_track_id: Optional[int] = Form(None),
    backing_file_key: Optional[str] = Form(None),
    mix_volumes: str = Form('{"vocal":1.0,"music":1.0,"bass":1.0,"drums":1.0,"guitar":1.0,"piano":1.0}'),
    is_split: bool = Form(False),
    split_vocals_key: Optional[str] = Form(None),
    split_drums_key: Optional[str] = Form(None),
    split_bass_key: Optional[str] = Form(None),
    split_other_key: Optional[str] = Form(None),
    split_guitar_key: Optional[str] = Form(None),
    split_piano_key: Optional[str] = Form(None),
    file: UploadFile = File(...)
) -> DraftResponse:
    """Saves recorded vocal track as a draft."""
    client = get_b2_client()
    uuid_str = str(uuid.uuid4())
    
    # Upload recorded vocal track
    vocal_key = f"studio/drafts/{current_user.id}/{uuid_str}_{file.filename}"
    try:
        client.upload_fileobj(
            file.file,
            settings.b2_bucket_name,
            vocal_key,
            ExtraArgs={"ContentType": file.content_type or "audio/webm"}
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to upload draft vocal recording to B2: {str(e)}")

    # Add DB record
    draft = Draft(
        artist_id=current_user.id,
        title=title,
        audio_file_key=vocal_key,
        backing_track_id=backing_track_id,
        backing_file_key=extract_b2_key(backing_file_key),
        is_split=is_split,
        split_vocals_key=extract_b2_key(split_vocals_key),
        split_drums_key=extract_b2_key(split_drums_key),
        split_bass_key=extract_b2_key(split_bass_key),
        split_other_key=extract_b2_key(split_other_key),
        split_guitar_key=extract_b2_key(split_guitar_key),
        split_piano_key=extract_b2_key(split_piano_key),
        mix_volumes=mix_volumes
    )
    
    db.add(draft)
    db.commit()
    db.refresh(draft)

    mix_dict = {}
    try:
        mix_dict = json.loads(draft.mix_volumes)
    except Exception:
        mix_dict = {"vocal":1.0,"music":1.0,"bass":1.0,"drums":1.0,"guitar":1.0,"piano":1.0}

    return DraftResponse(
        id=draft.id,
        title=draft.title,
        backing_track_id=draft.backing_track_id,
        backing_file_key=draft.backing_file_key,
        is_split=draft.is_split,
        mix_volumes=mix_dict,
        vocal_url=get_audio_url(draft.audio_file_key),
        split_vocals_url=get_audio_url(draft.split_vocals_key) if draft.split_vocals_key else None,
        split_drums_url=get_audio_url(draft.split_drums_key) if draft.split_drums_key else None,
        split_bass_url=get_audio_url(draft.split_bass_key) if draft.split_bass_key else None,
        split_other_url=get_audio_url(draft.split_other_key) if draft.split_other_key else None,
        split_guitar_url=get_audio_url(draft.split_guitar_key) if draft.split_guitar_key else None,
        split_piano_url=get_audio_url(draft.split_piano_key) if draft.split_piano_key else None,
        created_at=draft.created_at,
        updated_at=draft.updated_at
    )


@router.get("/drafts", response_model=List[DraftResponse])
def list_drafts(
    db: DbSession,
    current_user: CurrentArtistOrAdmin
) -> List[DraftResponse]:
    """Lists drafts belonging to the authenticated artist."""
    drafts = db.scalars(
        select(Draft)
        .where(Draft.artist_id == current_user.id)
        .order_by(Draft.created_at.desc())
    ).all()

    response = []
    for d in drafts:
        mix_dict = {}
        try:
            mix_dict = json.loads(d.mix_volumes)
        except Exception:
            mix_dict = {"vocal":1.0,"music":1.0,"bass":1.0,"drums":1.0,"guitar":1.0,"piano":1.0}
            
        response.append(DraftResponse(
            id=d.id,
            title=d.title,
            backing_track_id=d.backing_track_id,
            backing_file_key=d.backing_file_key,
            is_split=d.is_split,
            mix_volumes=mix_dict,
            vocal_url=get_audio_url(d.audio_file_key),
            split_vocals_url=get_audio_url(d.split_vocals_key) if d.split_vocals_key else None,
            split_drums_url=get_audio_url(d.split_drums_key) if d.split_drums_key else None,
            split_bass_url=get_audio_url(d.split_bass_key) if d.split_bass_key else None,
            split_other_url=get_audio_url(d.split_other_key) if d.split_other_key else None,
            split_guitar_url=get_audio_url(d.split_guitar_key) if d.split_guitar_key else None,
            split_piano_url=get_audio_url(d.split_piano_key) if d.split_piano_key else None,
            created_at=d.created_at,
            updated_at=d.updated_at
        ))
    return response


@router.put("/drafts/{draft_id}")
def update_draft(
    draft_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
    title: Optional[str] = Form(None),
    backing_track_id: Optional[str] = Form(None),  # String to allow sending empty string for None
    backing_file_key: Optional[str] = Form(None),
    is_split: Optional[bool] = Form(None),
    split_vocals_key: Optional[str] = Form(None),
    split_drums_key: Optional[str] = Form(None),
    split_bass_key: Optional[str] = Form(None),
    split_other_key: Optional[str] = Form(None),
    split_guitar_key: Optional[str] = Form(None),
    split_piano_key: Optional[str] = Form(None),
    mix_volumes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
) -> DraftResponse:
    """Updates draft metadata (vocal mix volumes, title, backing tracks, split keys, or uploads a new vocal take)."""
    draft = db.get(Draft, draft_id)
    if not draft or draft.artist_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    if title is not None:
        draft.title = title
    if backing_track_id is not None:
        if backing_track_id == "" or backing_track_id == "null":
            draft.backing_track_id = None
        else:
            draft.backing_track_id = int(backing_track_id)
    if backing_file_key is not None:
        if backing_file_key == "" or backing_file_key == "null":
            draft.backing_file_key = None
        else:
            draft.backing_file_key = extract_b2_key(backing_file_key)
    if is_split is not None:
        draft.is_split = is_split
    if split_vocals_key is not None:
        draft.split_vocals_key = extract_b2_key(split_vocals_key)
    if split_drums_key is not None:
        draft.split_drums_key = extract_b2_key(split_drums_key)
    if split_bass_key is not None:
        draft.split_bass_key = extract_b2_key(split_bass_key)
    if split_other_key is not None:
        draft.split_other_key = extract_b2_key(split_other_key)
    if split_guitar_key is not None:
        draft.split_guitar_key = extract_b2_key(split_guitar_key)
    if split_piano_key is not None:
        draft.split_piano_key = extract_b2_key(split_piano_key)
    if mix_volumes is not None:
        draft.mix_volumes = mix_volumes

    if file is not None:
        client = get_b2_client()
        uuid_str = str(uuid.uuid4())
        new_vocal_key = f"studio/drafts/{current_user.id}/{uuid_str}_{file.filename}"
        try:
            client.upload_fileobj(
                file.file,
                settings.b2_bucket_name,
                new_vocal_key,
                ExtraArgs={"ContentType": file.content_type or "audio/webm"}
            )
            # Delete old vocal file in B2
            if draft.audio_file_key:
                try:
                    delete_audio_file(draft.audio_file_key)
                except Exception:
                    pass
            draft.audio_file_key = new_vocal_key
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to upload new draft vocal recording to B2: {str(e)}")

    db.commit()
    db.refresh(draft)

    mix_dict = {}
    try:
        mix_dict = json.loads(draft.mix_volumes)
    except Exception:
        mix_dict = {"vocal":1.0,"music":1.0,"bass":1.0,"drums":1.0,"guitar":1.0,"piano":1.0}

    return DraftResponse(
        id=draft.id,
        title=draft.title,
        backing_track_id=draft.backing_track_id,
        backing_file_key=draft.backing_file_key,
        is_split=draft.is_split,
        mix_volumes=mix_dict,
        vocal_url=get_audio_url(draft.audio_file_key),
        split_vocals_url=get_audio_url(draft.split_vocals_key) if draft.split_vocals_key else None,
        split_drums_url=get_audio_url(draft.split_drums_key) if draft.split_drums_key else None,
        split_bass_url=get_audio_url(draft.split_bass_key) if draft.split_bass_key else None,
        split_other_url=get_audio_url(draft.split_other_key) if draft.split_other_key else None,
        split_guitar_url=get_audio_url(draft.split_guitar_key) if draft.split_guitar_key else None,
        split_piano_url=get_audio_url(draft.split_piano_key) if draft.split_piano_key else None,
        created_at=draft.created_at,
        updated_at=draft.updated_at
    )


@router.delete("/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(
    draft_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin
):
    """Deletes draft DB record and cleans up associated audio assets in B2."""
    draft = db.get(Draft, draft_id)
    if not draft or draft.artist_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    # Clean up B2
    for b2_key in [
        draft.audio_file_key, draft.backing_file_key,
        draft.split_vocals_key, draft.split_drums_key, draft.split_bass_key,
        draft.split_other_key, draft.split_guitar_key, draft.split_piano_key
    ]:
        if b2_key:
            try:
                delete_audio_file(b2_key)
            except Exception:
                pass
                
    db.delete(draft)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/drafts/{draft_id}/publish")
def publish_draft(
    draft_id: int,
    db: DbSession,
    current_user: CurrentArtistOrAdmin,
    title: str = Form(...),
    album_id: Optional[int] = Form(None),
    lyrics: Optional[str] = Form(None),
    cover_image: Optional[UploadFile] = File(None)
):
    """Mixes vocal and accompaniment layers using FFmpeg, transcodes to HLS, and publishes draft as a Track."""
    draft = db.get(Draft, draft_id)
    if not draft or draft.artist_id != current_user.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    client = get_b2_client()
    bucket_name = settings.b2_bucket_name

    # Check album ownership if album_id is set
    if album_id is not None:
        album = db.get(Album, album_id)
        if not album or album.artist_id != current_user.id:
            raise HTTPException(status_code=403, detail="Invalid album selection")

    temp_dir = tempfile.mkdtemp()
    try:
        # Parse volumes and editing/trim settings
        volumes = {"vocal": 1.0, "music": 1.0, "bass": 1.0, "drums": 1.0, "guitar": 1.0, "piano": 1.0}
        try:
            volumes.update(json.loads(draft.mix_volumes))
        except Exception:
            pass

        # Parse trim and offset configs from volumes dict
        vocal_trim_start = float(volumes.get("vocal_trim_start", 0.0))
        vocal_trim_end = float(volumes.get("vocal_trim_end", 0.0))
        vocal_offset = float(volumes.get("vocal_offset", 0.0))
        backing_trim_start = float(volumes.get("backing_trim_start", 0.0))
        backing_trim_end = float(volumes.get("backing_trim_end", 0.0))

        # 1. Download vocal track
        vocal_path = os.path.join(temp_dir, "vocal.wav")
        try:
            client.download_file(bucket_name, draft.audio_file_key, vocal_path)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to fetch draft vocal audio: {str(e)}")

        inputs = [vocal_path]
        
        # Build FFmpeg filter chain for vocal (volume, trim, delay/offset)
        vocal_filters = []
        if vocal_trim_start > 0.0 or vocal_trim_end > 0.0:
            trim_str = f"atrim=start={vocal_trim_start}"
            if vocal_trim_end > 0.0:
                trim_str += f":end={vocal_trim_end}"
            vocal_filters.append(trim_str)
            vocal_filters.append("asetpts=PTS-START")
        if vocal_offset > 0.0:
            offset_ms = int(vocal_offset * 1000)
            vocal_filters.append(f"adelay={offset_ms}|{offset_ms}")
        
        v_filter_base = f"[0:a]volume={volumes['vocal']}"
        if vocal_filters:
            v_filter_base += "," + ",".join(vocal_filters)
        v_filter_base += "[a0]"
        
        filters = [v_filter_base]
        mix_inputs = ["[a0]"]
        input_idx = 1

        # Common backing trim filter builder
        backing_filters = []
        if backing_trim_start > 0.0 or backing_trim_end > 0.0:
            trim_str = f"atrim=start={backing_trim_start}"
            if backing_trim_end > 0.0:
                trim_str += f":end={backing_trim_end}"
            backing_filters.append(trim_str)
            backing_filters.append("asetpts=PTS-START")

        # 2. Download split layers (6-stem: htdemucs_6s)
        if draft.is_split:
            layer_configs = [
                ("split_vocals_key", "backingVocal"),
                ("split_other_key", "music"),
                ("split_bass_key", "bass"),
                ("split_drums_key", "drums"),
                ("split_guitar_key", "guitar"),
                ("split_piano_key", "piano"),
            ]
            for key_field, vol_field in layer_configs:
                key_value = getattr(draft, key_field)
                vol_value = volumes.get(vol_field, 1.0)
                if key_value and vol_value > 0.0:
                    local_layer_path = os.path.join(temp_dir, f"layer_{input_idx}.mp3")
                    try:
                        client.download_file(bucket_name, key_value, local_layer_path)
                        inputs.append(local_layer_path)
                        
                        stem_filter = f"[{input_idx}:a]volume={vol_value}"
                        if backing_filters:
                            stem_filter += "," + ",".join(backing_filters)
                        stem_filter += f"[a{input_idx}]"
                        
                        filters.append(stem_filter)
                        mix_inputs.append(f"[a{input_idx}]")
                        input_idx += 1
                    except Exception as e:
                        print(f"[Publish Warning] Failed to download split layer {key_field}: {e}", flush=True)
        else:
            # Unsplit backing track: can be backing_track_id or backing_file_key
            backing_key = None
            if draft.backing_track_id:
                backing_track = db.get(Track, draft.backing_track_id)
                if backing_track and backing_track.audio_file_key:
                    backing_key = backing_track.audio_file_key
            elif draft.backing_file_key:
                backing_key = draft.backing_file_key

            if backing_key:
                vol_value = volumes.get("music", 1.0)
                if vol_value > 0.0:
                    local_backing_path = os.path.join(temp_dir, f"backing_{input_idx}.mp3")
                    try:
                        client.download_file(bucket_name, backing_key, local_backing_path)
                        inputs.append(local_backing_path)
                        
                        stem_filter = f"[{input_idx}:a]volume={vol_value}"
                        if backing_filters:
                            stem_filter += "," + ",".join(backing_filters)
                        stem_filter += f"[a{input_idx}]"
                        
                        filters.append(stem_filter)
                        mix_inputs.append(f"[a{input_idx}]")
                        input_idx += 1
                    except Exception as e:
                        print(f"[Publish Warning] Failed to download backing track: {e}", flush=True)

        # 3. Mix using FFmpeg
        mixed_path = os.path.join(temp_dir, "mixed.mp3")
        if len(inputs) == 1:
            # Just convert vocal track to mp3 directly
            cmd = ["ffmpeg", "-y", "-i", vocal_path, "-b:a", "192k", mixed_path]
        else:
            filter_complex = ";".join(filters)
            joined_inputs = "".join(mix_inputs)
            filter_complex += f";{joined_inputs}amix=inputs={len(inputs)}:duration=longest"
            
            cmd = ["ffmpeg", "-y"]
            for inp in inputs:
                cmd.extend(["-i", inp])
            cmd.extend(["-filter_complex", filter_complex, "-b:a", "192k", mixed_path])

        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as err:
            raise HTTPException(
                status_code=500,
                detail=f"FFmpeg mixing error: {err.stderr.decode('utf-8', errors='ignore')}"
            )

        # 4. Detect mixed audio duration using ffprobe
        duration_seconds = 0
        try:
            probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mixed_path]
            probe_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            duration_seconds = int(float(probe_res.stdout.strip()))
        except Exception:
            duration_seconds = 180  # fallback

        # 5. Create core DB Track record
        new_track = Track(
            title=title,
            album_id=album_id,
            artist_id=current_user.id,
            duration_seconds=duration_seconds,
            lyrics=lyrics,
        )
        db.add(new_track)
        db.commit()
        db.refresh(new_track)

        # 6. Transcode mixed audio to HLS & upload HLS + fallback raw audio
        temp_hls_dir = None
        try:
            hls_result = transcode_to_hls(mixed_path, new_track.id)
            temp_hls_dir = hls_result["temp_dir"]

            hls_playlist_key = f"tracks/{new_track.id}/hls/playlist.m3u8"
            hls_key_key = f"tracks/{new_track.id}/hls/enc.key"
            audio_raw_key = f"tracks/{new_track.id}/audio.mp3"
            backup_raw_key = f"tracks/{new_track.id}/backup/backup.mp3"

            # Upload segments
            for fname in os.listdir(temp_hls_dir):
                fpath = os.path.join(temp_hls_dir, fname)
                if os.path.isdir(fpath):
                    continue

                if fname == "playlist.m3u8":
                    b2_key = hls_playlist_key
                    content_type = "application/x-mpegURL"
                elif fname == hls_result["key_name"]:
                    b2_key = hls_key_key
                    content_type = "application/octet-stream"
                elif fname.endswith(".ts"):
                    b2_key = f"tracks/{new_track.id}/hls/{fname}"
                    content_type = "video/MP2T"
                else:
                    continue

                upload_local_file(local_path=fpath, object_key=b2_key, content_type=content_type)
                
            # Upload raw files: standard compatibility raw track and separate raw backup file
            upload_local_file(local_path=mixed_path, object_key=audio_raw_key, content_type="audio/mpeg")
            upload_local_file(local_path=mixed_path, object_key=backup_raw_key, content_type="audio/mpeg")

            # 7. Upload cover image if provided
            cover_key = None
            if cover_image:
                cover_key = f"tracks/{new_track.id}/cover.jpg"
                client.upload_fileobj(
                    cover_image.file,
                    bucket_name,
                    cover_key,
                    ExtraArgs={"ContentType": cover_image.content_type or "image/jpeg"}
                )

            # 8. Save references to Track and TrackBackup models
            new_track.audio_file_key = audio_raw_key
            new_track.hls_playlist_key = hls_playlist_key
            new_track.hls_key_key = hls_key_key
            if cover_key:
                new_track.cover_image_key = cover_key

            backup_record = TrackBackup(
                track_id=new_track.id,
                backup_file_key=backup_raw_key
            )
            db.add(backup_record)
            
            # 9. Clear the published Draft and B2 assets
            db.delete(draft)
            db.commit()
            db.refresh(new_track)

            # 10. Recompute search indexing for search features
            index_and_embed_track(db, new_track)
            db.commit()

        except Exception as upload_exc:
            # Revert/delete created track row on ANY failure during transcoding, uploading, or indexing
            try:
                db.delete(new_track)
                db.commit()
            except Exception:
                db.rollback()
            raise HTTPException(status_code=503, detail=f"Failed to publish track: {str(upload_exc)}")
        finally:
            if temp_hls_dir:
                try:
                    shutil.rmtree(temp_hls_dir)
                except Exception:
                    pass

        # Cleanup draft assets in B2
        for b2_key in [draft.audio_file_key, draft.backing_file_key, draft.split_vocals_key, draft.split_drums_key, draft.split_bass_key, draft.split_other_key, draft.split_guitar_key, draft.split_piano_key]:
            if b2_key:
                try:
                    delete_audio_file(b2_key)
                except Exception:
                    pass

        # Fetch URL for response
        resp_audio_key = new_track.hls_playlist_key or new_track.audio_file_key
        return {
            "id": new_track.id,
            "title": new_track.title,
            "album_id": new_track.album_id,
            "duration_seconds": new_track.duration_seconds,
            "audio_url": get_audio_url(resp_audio_key),
            "cover_url": new_track.cover_url,
            "album_title": new_track.album_title,
            "artist_id": new_track.effective_artist_id,
            "artist_name": new_track.artist_name,
            "lyrics": new_track.lyrics,
            "created_at": new_track.created_at
        }

    finally:
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass


@router.get("/backups")
def get_user_backups(
    db: DbSession,
    current_user: CurrentArtistOrAdmin
) -> List[int]:
    """Returns a list of track IDs that have raw backups available for the artist."""
    backups = db.scalars(
        select(TrackBackup.track_id)
        .join(Track, Track.id == TrackBackup.track_id)
        .where(Track.artist_id == current_user.id)
    ).all()
    return list(backups)


@router.get("/tracks/{track_id}/backup/download")
def download_track_backup(
    track_id: int,
    db: DbSession,
    current_user: CurrentUser
):
    """Generates a presigned URL and redirects to download the raw .mp3 backup of a track.

    Allowed for: Track's artist, admin, or master_admin.
    """
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Authorize: user must be the artist who published it or an administrator
    is_owner = track.artist_id == current_user.id
    is_admin = current_user.role in ("admin", "master_admin")
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="You do not have permission to download this track backup")

    backup = db.get(TrackBackup, track_id)
    if not backup or not backup.backup_file_key:
        raise HTTPException(status_code=404, detail="No raw backup file exists for this track")

    # Generate presigned URL
    download_url = get_audio_url(backup.backup_file_key, expires_in=1800)
    if not download_url:
        raise HTTPException(status_code=503, detail="Failed to generate download URL")

    return RedirectResponse(url=download_url)
