from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from agentic_ai.src.state import AgenticState
from agentic_ai.src.nodes import (
    search_candidates,
    submit_to_hitl_queue,
    admin_reviews_request,
    notify_rejection,
    download_and_upload_audio,
    process_and_upload_cover,
    fetch_artist_metadata,
    populate_artist,
    sync_join,
    populate_track,
    notify_user_available,
    report_missing_song
)

def route_after_admin(state: AgenticState):
    """
    Routes the execution after admin review.
    If approved, spawns the parallel ingestion branches in-memory.
    If rejected, routes to notification of rejection.
    """
    if state.get("admin_approved") is True:
        # Trigger parallel ingestion branches
        return ["download_and_upload_audio", "process_and_upload_cover", "fetch_artist_metadata"]
    else:
        return "notify_rejection"

def route_after_search(state: AgenticState):
    """
    Routes the execution after candidate search.
    If candidates list is present and has items, submit to queue.
    Otherwise, report the missing song.
    """
    candidates = state.get("candidates") or []
    if len(candidates) > 0:
        return "submit_to_hitl_queue"
    else:
        return "report_missing_song"

def route_after_sync(state: AgenticState):
    """
    Evaluates whether all parallel branches are complete before populating track.
    This acts as a synchronization barrier for joining.
    """
    audio_ok = state.get("audio_status") == "completed"
    cover_ok = state.get("cover_status") == "completed"
    artist_ok = state.get("artist_status") == "completed"
    
    if audio_ok and cover_ok and artist_ok:
        return "populate_track"
    else:
        # Terminate this branch run; the last completed branch will proceed to populate_track.
        return END

def route_after_submit(state: AgenticState):
    """
    Routes execution after HITL submission.
    If the user selected the "Report Missing Song" option, skip admin review
    and route directly to reporting the missing song.
    """
    selected_song_id = state.get("selected_song_id")
    if selected_song_id == "report_missing":
        return "report_missing_song"
    else:
        return "admin_reviews_request"

def create_workflow():
    workflow = StateGraph(AgenticState)
    
    # 1. Register all nodes
    workflow.add_node("search_candidates", search_candidates)
    workflow.add_node("submit_to_hitl_queue", submit_to_hitl_queue)
    workflow.add_node("admin_reviews_request", admin_reviews_request)
    workflow.add_node("notify_rejection", notify_rejection)
    
    # In-memory combined ingestion nodes
    workflow.add_node("download_and_upload_audio", download_and_upload_audio)
    workflow.add_node("process_and_upload_cover", process_and_upload_cover)
    
    # Artist Branch
    workflow.add_node("fetch_artist_metadata", fetch_artist_metadata)
    workflow.add_node("populate_artist", populate_artist)
    
    # Join and Final Nodes
    workflow.add_node("sync_join", sync_join)
    workflow.add_node("populate_track", populate_track)
    workflow.add_node("notify_user_available", notify_user_available)
    workflow.add_node("report_missing_song", report_missing_song)
    
    # 2. Build graph structure (Edges)
    workflow.add_edge(START, "search_candidates")
    
    # Pause point 1: Interrupt after search_candidates ONLY IF candidates exist.
    workflow.add_conditional_edges(
        "search_candidates",
        route_after_search,
        {
            "submit_to_hitl_queue": "submit_to_hitl_queue",
            "report_missing_song": "report_missing_song"
        }
    )
    
    # Connect report_missing_song directly to END
    workflow.add_edge("report_missing_song", END)
    
    # Pause point 2: Conditional routing after HITL submission queue node.
    workflow.add_conditional_edges(
        "submit_to_hitl_queue",
        route_after_submit,
        {
            "admin_reviews_request": "admin_reviews_request",
            "report_missing_song": "report_missing_song"
        }
    )
    
    # Conditional branching from admin review node
    workflow.add_conditional_edges(
        "admin_reviews_request",
        route_after_admin,
        {
            "download_and_upload_audio": "download_and_upload_audio",
            "process_and_upload_cover": "process_and_upload_cover",
            "fetch_artist_metadata": "fetch_artist_metadata",
            "notify_rejection": "notify_rejection"
        }
    )
    
    # Ingestion branches flows pointing directly to sync join
    workflow.add_edge("download_and_upload_audio", "sync_join")
    workflow.add_edge("process_and_upload_cover", "sync_join")
    
    workflow.add_edge("fetch_artist_metadata", "populate_artist")
    workflow.add_edge("populate_artist", "sync_join")
    
    # Synchronize branches to join
    workflow.add_conditional_edges(
        "sync_join",
        route_after_sync,
        {
            "populate_track": "populate_track",
            END: END
        }
    )
    
    # Post-join flow
    workflow.add_edge("populate_track", "notify_user_available")
    workflow.add_edge("notify_user_available", END)
    
    # Rejection flow
    workflow.add_edge("notify_rejection", END)
    
    # 3. Compile with memory saver to persist state during interrupts
    memory = MemorySaver()
    app = workflow.compile(
        checkpointer=memory,
        interrupt_after=["search_candidates"],
        interrupt_before=["admin_reviews_request"]
    )
    
    return app
