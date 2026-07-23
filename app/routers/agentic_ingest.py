import uuid
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, func

from app.core.deps import DbSession, CurrentUser, CurrentAdmin
from app.models.ingestion_request import IngestionRequest
from app.core.config import settings
from agentic_ai.src.graph import create_workflow

router = APIRouter(prefix="/agentic-ingest", tags=["agentic-ingest"])

# Keep the compiled workflow graph as a thread-safe singleton
workflow = create_workflow()


class SearchRequest(BaseModel):
    song_name: str


class SelectRequest(BaseModel):
    thread_id: str
    selected_song_id: str


@router.post("/search")
def search_song(payload: SearchRequest, db: DbSession, current_user: CurrentUser):
    """
    Search for a song name using the agentic pipeline.
    Runs search_candidates and pauses at selection interrupt.
    """
    thread_id = str(uuid.uuid4())
    config = {
        "configurable": {
            "thread_id": thread_id,
            "db": db
        }
    }
    
    try:
        # Run workflow up to selection interrupt
        events = list(workflow.stream({"song_name": payload.song_name}, config, stream_mode="values"))
        
        state = workflow.get_state(config)
        
        # If no candidates found, the graph executes cleanly to END via report_missing_song
        if "report_missing_song" in state.next:
            # Resume to run report_missing_song and complete
            events = list(workflow.stream(None, config, stream_mode="values"))
            final_state = workflow.get_state(config).values
            return {
                "thread_id": thread_id,
                "status": "not_found",
                "candidates": [],
                "logs": final_state.get("logs", [])
            }
            
        final_state = state.values
        return {
            "thread_id": thread_id,
            "status": "selection_required",
            "candidates": final_state.get("candidates", []),
            "logs": final_state.get("logs", [])
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agentic search failed: {str(e)}"
        )


@router.post("/select")
def select_candidate(payload: SelectRequest, db: DbSession, current_user: CurrentUser):
    """
    Select a candidate song from search results (or choose 'report_missing').
    Resumes graph execution.
    """
    config = {
        "configurable": {
            "thread_id": payload.thread_id,
            "db": db
        }
    }
    
    state = workflow.get_state(config)
    if not state.values:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session thread not found or expired."
        )
        
    candidates = state.values.get("candidates", [])
    
    # 1. Update selection in state
    if payload.selected_song_id == "report_missing":
        selected_song = {
            "id": "report_missing",
            "title": state.values.get("song_name", "Unknown"),
            "artist": "Unknown",
            "album": "Unknown",
            "duration_seconds": 0,
            "source_url": "",
            "cover_url": ""
        }
        workflow.update_state(config, {
            "selected_song_id": "report_missing",
            "selected_song": selected_song
        })
    else:
        # Find matching candidate
        matching_cand = next((c for c in candidates if c["id"] == payload.selected_song_id), None)
        if not matching_cand:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid candidate ID: {payload.selected_song_id}"
            )
        workflow.update_state(config, {
            "selected_song_id": matching_cand["id"],
            "selected_song": matching_cand,
            "audio_status": "pending",
            "cover_status": "pending",
            "artist_status": "pending",
            "track_status": "pending"
        })
        
    try:
        # Resume stream to next interrupt
        events = list(workflow.stream(None, config, stream_mode="values"))
        
        # Check current state
        state = workflow.get_state(config)
        
        # If user chose 'report_missing', it went to report_missing_song and finished
        if not state.next:
            return {
                "status": "reported",
                "logs": state.values.get("logs", [])
            }
            
        # Add a record to the ingestion_requests database queue table
        matching_cand = state.values.get("selected_song", {})
        db_req = IngestionRequest(
            thread_id=payload.thread_id,
            song_name=matching_cand.get("title", "Unknown"),
            artist_name=matching_cand.get("artist", "Unknown Artist"),
            user_id=current_user.id,
            source_url=matching_cand.get("source_url", ""),
            cover_url=matching_cand.get("cover_url", ""),
            genres=matching_cand.get("genres", ""),
            status="pending"
        )
        db.add(db_req)
        db.commit()
        
        # Otherwise, paused at admin_reviews_request queue
        return {
            "status": "pending_admin_approval",
            "logs": state.values.get("logs", [])
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Candidate selection update failed: {str(e)}"
        )


# Admin Ingestion Queue endpoints
@router.get("/requests")
def get_ingestion_requests(db: DbSession, current_admin: CurrentAdmin):
    """
    Retrieve list of ingestion requests in the queue (Admin only).
    """
    # Join with User to display requested_by username
    query = (
        select(IngestionRequest)
        .order_by(IngestionRequest.created_at.asc())
    )
    requests = db.scalars(query).all()
    
    return [
        {
            "id": r.id,
            "thread_id": r.thread_id,
            "song_name": r.song_name,
            "artist_name": r.artist_name,
            "requested_by": r.user.username if r.user else "Unknown User",
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "source_url": r.source_url,
            "status": r.status
        }
        for r in requests
    ]


def run_ingestion_background(request_id: int, thread_id: str, db_url: str):
    """
    Runs the LangGraph audio extraction and database population pipeline in the background.
    """
    print(f"[Ingestion Task] Starting ingestion flow for Request ID: {request_id}, Thread ID: {thread_id}", flush=True)
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.ingestion_request import IngestionRequest
    from app.models.track import Track
    
    engine = create_engine(db_url)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # 1. Re-fetch request inside task transaction
        db_req = db.scalar(select(IngestionRequest).where(IngestionRequest.id == request_id))
        if not db_req:
            print(f"[Ingestion Task ERROR] Request ID {request_id} not found in database.", flush=True)
            return
            
        # 2. First pre-create/allocate the Track in database to obtain a real track_id
        db_track = Track(
            title=db_req.song_name,
            duration_seconds=200,  # fallback default
            audio_file_key=None,
            cover_image_key=None
        )
        db.add(db_track)
        db.commit()
        db.refresh(db_track)
        print(f"[Ingestion Task] Allocated Track ID: {db_track.id} for song '{db_req.song_name}'", flush=True)
        
        # 3. Create graph and run using the newly created track_id
        from agentic_ai.src.graph import create_workflow
        bg_workflow = create_workflow()
        
        config = {
            "configurable": {
                "thread_id": thread_id,
                "db": db
            }
        }
        
        bg_workflow.update_state(config, {
            "admin_approved": True,
            "track_id": db_track.id,
            "admin_notes": "Approved via Admin Console"
        })
        
        print(f"[Ingestion Task] Invoking LangGraph workflow for Track ID {db_track.id}...", flush=True)
        events = list(bg_workflow.stream(None, config, stream_mode="values"))
        
        # Verify track updated correctly
        db.refresh(db_track)
        db.refresh(db_req)
        if db_track.audio_file_key:
            db_req.status = "completed"
            print(f"[Ingestion Task SUCCESS] Ingestion completed successfully for Request ID: {request_id}. Track ID: {db_track.id}", flush=True)
        else:
            db_req.status = "failed"
            print(f"[Ingestion Task FAILED] Ingestion failed (no audio key generated) for Request ID: {request_id}.", flush=True)
            
        db.commit()
    except Exception as e:
        import traceback
        print(f"[Ingestion Task CRITICAL ERROR] Failed for Request ID {request_id}: {str(e)}", flush=True)
        traceback.print_exc()
        db.rollback()
        # Mark as failed
        db_req = db.scalar(select(IngestionRequest).where(IngestionRequest.id == request_id))
        if db_req:
            db_req.status = "failed"
            db.commit()
    finally:
        db.close()


@router.post("/requests/{request_id}/approve")
def approve_ingestion_request(
    request_id: int, 
    db: DbSession, 
    current_admin: CurrentAdmin
):
    """
    Approve ingestion request with Postgres row-level locking (Admin only).
    Runs ingestion synchronously using the active DB session to prevent Render Free Tier from freezing.
    """
    # 1. Lock the row for update immediately (binary lock)
    db_req = db.scalar(
        select(IngestionRequest)
        .where(IngestionRequest.id == request_id)
        .with_for_update()
    )
    if not db_req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
        
    if db_req.status not in ["pending", "failed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="This request is already being processed or completed."
        )
        
    # 2. Acquire lock and set status to processing
    db_req.status = "processing"
    db.commit()
    
    # 3. Execute synchronously using the active DB session (to bypass transient checkpointer issues)
    print(f"[Ingestion Task] Starting ingestion flow for Request ID: {db_req.id}", flush=True)
    try:
        from app.models.track import Track
        from app.models.artist import Artist
        from app.models.album import Album
        from sqlalchemy import or_
        
        # Check if the exact song (title + artist name) already exists in database (matching either track artist or album artist)
        existing_track = db.scalars(
            select(Track)
            .outerjoin(Album, Track.album_id == Album.id)
            .outerjoin(Artist, or_(Track.artist_id == Artist.id, Album.artist_id == Artist.id))
            .where(func.lower(Track.title) == func.lower(db_req.song_name))
            .where(func.lower(Artist.name) == func.lower(db_req.artist_name))
        ).first()
        
        if existing_track:
            db_req.status = "Exists"
            db.commit()
            print(f"[Ingestion Task Short-Circuit] Song '{db_req.song_name}' by '{db_req.artist_name}' already exists in DB (ID: {existing_track.id}). Skipping ingestion.", flush=True)
            return {"message": "Track already exists in the database.", "status": "Exists"}
        
        # Allocate Track
        db_track = Track(
            title=db_req.song_name,
            duration_seconds=200,  # fallback default
            audio_file_key=None,
            cover_image_key=None
        )
        db.add(db_track)
        db.commit()
        db.refresh(db_track)
        print(f"[Ingestion Task] Allocated Track ID: {db_track.id} for song '{db_req.song_name}'", flush=True)
        
        # Prepare state values
        state = {
            "song_name": db_req.song_name,
            "selected_song": {
                "title": db_req.song_name,
                "artist": db_req.artist_name,
                "source_url": db_req.source_url,
                "cover_url": db_req.cover_url or "https://picsum.photos/500/500",
                "genres": db_req.genres or ""
            },
            "admin_approved": True,
            "track_id": db_track.id,
            "admin_notes": "Approved via Admin Console"
        }
        
        from agentic_ai.src.nodes import (
            download_and_upload_audio,
            process_and_upload_cover,
            fetch_artist_metadata,
            populate_artist,
            populate_track
        )
        
        # 3.1. Download and upload audio
        print(f"[Ingestion Task] Executing download_and_upload_audio...", flush=True)
        audio_res = download_and_upload_audio(state)
        
        # Check if the audio download encountered any error (to fail fast and clean up catalog/S3)
        has_audio_error = any("Branch A Error" in log for log in audio_res.get("logs", []))
        if has_audio_error:
            err_log = next((log for log in audio_res.get("logs", []) if "Branch A Error" in log), "Audio download failed")
            raise ValueError(f"Audio download failed: {err_log}")
            
        state.update(audio_res)
        
        # 3.2. Download and upload cover photo
        print(f"[Ingestion Task] Executing process_and_upload_cover...", flush=True)
        cover_res = process_and_upload_cover(state)
        state.update(cover_res)
        
        # 3.3. Fetch artist details
        print(f"[Ingestion Task] Executing fetch_artist_metadata...", flush=True)
        artist_res = fetch_artist_metadata(state)
        state.update(artist_res)
        
        config = {"configurable": {"db": db}}
        
        # 3.4. Populate artist table
        print(f"[Ingestion Task] Executing populate_artist...", flush=True)
        artist_pop_res = populate_artist(state, config)
        state.update(artist_pop_res)
        
        # 3.5. Populate track table
        print(f"[Ingestion Task] Executing populate_track...", flush=True)
        track_pop_res = populate_track(state, config)
        state.update(track_pop_res)
        
        # Verify track updated correctly
        db.refresh(db_track)
        db.refresh(db_req)
        if db_track.audio_file_key:
            db_req.status = "completed"
            print(f"[Ingestion Task SUCCESS] Ingestion completed successfully for Request ID: {request_id}. Track ID: {db_track.id}", flush=True)
        else:
            db_req.status = "failed"
            print(f"[Ingestion Task FAILED] Ingestion failed (no audio key generated) for Request ID: {request_id}.", flush=True)
            # Delete empty track to keep catalog clean
            try:
                db.delete(db_track)
            except Exception:
                pass
            
        db.commit()
    except Exception as e:
        import traceback
        print(f"[Ingestion Task CRITICAL ERROR] Failed for Request ID {request_id}: {str(e)}", flush=True)
        traceback.print_exc()
        db.rollback()
        
        # 1. Clean up Backblaze B2 objects if uploaded before the failure
        try:
            import boto3
            import os
            s3_client = boto3.client(
                's3',
                endpoint_url=os.getenv("B2_S3_ENDPOINT_URL"),
                aws_access_key_id=os.getenv("B2_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("B2_SECRET_ACCESS_KEY"),
                region_name=os.getenv("B2_REGION_NAME", "us-east-005")
            )
            bucket_name = os.getenv("B2_BUCKET_NAME", "fermata-music-app")
            
            # Clean up audio file
            if 'audio_res' in locals() and isinstance(audio_res, dict) and audio_res.get("audio_url"):
                audio_url = audio_res.get("audio_url")
                if "tracks/" in audio_url:
                    audio_key = "tracks/" + audio_url.split("tracks/")[1]
                    s3_client.delete_object(Bucket=bucket_name, Key=audio_key)
                    print(f"[Cleanup] Deleted failed audio upload from B2: {audio_key}", flush=True)
            
            # Clean up cover file
            if 'cover_res' in locals() and isinstance(cover_res, dict) and cover_res.get("cover_url"):
                cover_url = cover_res.get("cover_url")
                if "tracks/" in cover_url:
                    cover_key = "tracks/" + cover_url.split("tracks/")[1]
                    s3_client.delete_object(Bucket=bucket_name, Key=cover_key)
                    print(f"[Cleanup] Deleted failed cover upload from B2: {cover_key}", flush=True)
        except Exception as b2_exc:
            print(f"[Cleanup Warning] Failed to clean up B2 files: {str(b2_exc)}", flush=True)
            
        # 2. Clean up Track record from database if created
        try:
            if 'db_track' in locals() and db_track.id:
                t_del = db.get(Track, db_track.id)
                if t_del:
                    db.delete(t_del)
                    db.commit()
                    print(f"[Cleanup] Deleted allocated track record ID {db_track.id} from DB.", flush=True)
        except Exception as db_exc:
            print(f"[Cleanup Warning] Failed to delete track record from DB: {str(db_exc)}", flush=True)
            
        # 3. Mark request as failed inside a separate transaction
        try:
            db_req = db.scalar(select(IngestionRequest).where(IngestionRequest.id == request_id))
            if db_req:
                db_req.status = "failed"
                db.commit()
        except Exception:
            pass
            
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {str(e)}"
        )
    
    return {"message": "Request approved and processed."}


@router.post("/requests/{request_id}/reject")
def reject_ingestion_request(request_id: int, db: DbSession, current_admin: CurrentAdmin):
    """
    Reject ingestion request (Admin only).
    """
    db_req = db.scalar(
        select(IngestionRequest)
        .where(IngestionRequest.id == request_id)
        .with_for_update()
    )
    if not db_req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
        
    if db_req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="This request is already being processed or completed."
        )
        
    db_req.status = "rejected"
    db.commit()
    
    return {"message": "Request rejected successfully."}


@router.delete("/requests/{request_id}")
def delete_ingestion_request(request_id: int, db: DbSession, current_admin: CurrentAdmin):
    """
    Delete / remove an ingestion request from the queue (Admin only).
    """
    db_req = db.scalar(
        select(IngestionRequest)
        .where(IngestionRequest.id == request_id)
    )
    if not db_req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found.")
        
    db.delete(db_req)
    db.commit()
    
    return {"message": "Request deleted successfully from queue."}
