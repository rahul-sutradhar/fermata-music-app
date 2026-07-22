from typing import TypedDict, List, Dict, Any, Optional, Annotated

def reduce_logs(left: List[str], right: List[str]) -> List[str]:
    """
    State reducer to merge lists of logs.
    Enables concurrent/parallel nodes to write to the 'logs' key.
    """
    if not left:
        return right
    if not right:
        return left
    return left + right

class AgenticState(TypedDict):
    # Inputs
    song_name: str
    
    # 1. Search Candidates
    candidates: List[Dict[str, Any]]
    
    # 2. Selection (User HITL)
    selected_song_id: Optional[str]
    selected_song: Optional[Dict[str, Any]]
    
    # 3. Admin Review (Admin HITL)
    admin_approved: Optional[bool]
    admin_notes: Optional[str]
    
    # 4. Ingestion statuses (Parallel branches)
    audio_url: Optional[str]
    audio_status: str  # "pending", "completed", "failed"
    
    cover_url: Optional[str]
    cover_status: str  # "pending", "completed", "failed"
    
    artist_metadata: Optional[Dict[str, Any]]
    artist_id: Optional[int]
    artist_status: str  # "pending", "completed", "failed"
    
    # 5. Final Ingestion status (Join node + DB population)
    track_id: Optional[int]
    track_status: str  # "pending", "completed", "failed"
    
    # Notification & execution logging (Annotated with reduce_logs)
    logs: Annotated[List[str], reduce_logs]
