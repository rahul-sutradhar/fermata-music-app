import uuid
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.deps import DbSession, CurrentUser
from agentic_ai.src.graph import create_workflow

router = APIRouter(prefix="/agentic-ingest", tags=["agentic-ingest"])

# Keep the compiled workflow graph as a thread-safe singleton
workflow = create_workflow()


class SearchRequest(BaseModel):
    song_name: str


class SelectRequest(BaseModel):
    thread_id: str
    selected_song_id: str


class AdminReviewRequest(BaseModel):
    thread_id: str
    approved: bool
    notes: str = ""


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


@router.post("/admin-review")
def admin_review(payload: AdminReviewRequest, db: DbSession, current_user: CurrentUser):
    """
    Submits administrative review decision (approve/reject).
    Resumes graph and executes B2 file streaming and DB insertion.
    """
    config = {
        "configurable": {
            "thread_id": payload.thread_id,
            "db": db
        }
    }
    
    state = workflow.get_state(config)
    if not state.values or "admin_reviews_request" not in state.next:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session thread not found or not awaiting admin review."
        )
        
    try:
        # 1. Update admin review decision in state
        workflow.update_state(config, {
            "admin_approved": payload.approved,
            "admin_notes": payload.notes or ("Approved" if payload.approved else "Rejected")
        })
        
        # 2. Resume graph execution to the end
        events = list(workflow.stream(None, config, stream_mode="values"))
        
        final_state = workflow.get_state(config).values
        
        if payload.approved:
            return {
                "status": "completed",
                "track_id": final_state.get("track_id"),
                "audio_url": final_state.get("audio_url"),
                "cover_url": final_state.get("cover_url"),
                "logs": final_state.get("logs", [])
            }
        else:
            return {
                "status": "rejected",
                "logs": final_state.get("logs", [])
            }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Admin review execution failed: {str(e)}"
        )
