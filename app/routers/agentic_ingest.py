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
        
        # Run to completion
        events = list(bg_workflow.stream(None, config, stream_mode="values"))
        
        # Verify track updated correctly
        db.refresh(db_track)
        db.refresh(db_req)
        if db_track.audio_file_key:
            db_req.status = "completed"
        else:
            db_req.status = "failed"
            
        db.commit()
    except Exception as e:
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
    background_tasks: BackgroundTasks, 
    db: DbSession, 
    current_admin: CurrentAdmin
):
    """
    Approve ingestion request with Postgres row-level locking (Admin only).
    Spawns background ingestion task.
    """
    # 1. Lock the row for update immediately (binary lock)
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
        
    # 2. Acquire lock and set status to processing
    db_req.status = "processing"
    db.commit()
    
    # 3. Queue execution to background task
    background_tasks.add_task(
        run_ingestion_background,
        request_id=db_req.id,
        thread_id=db_req.thread_id,
        db_url=str(db.bind.url)
    )
    
    return {"message": "Request approved. Ingestion started in background."}


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
