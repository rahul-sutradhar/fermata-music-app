import os
import sys
from dotenv import load_dotenv

# Add the root directory of the project to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Load environment variables
load_dotenv()

from agentic_ai.src.graph import create_workflow

def print_header(title: str):
    print("\n" + "=" * 60)
    print(f" {title.center(58)} ")
    print("=" * 60)

def main():
    print_header("Fermata - Agentic Music Ingestion System")
    print("This interactive CLI demonstrates the LangGraph-based ingestion workflow.\n")
    
    # Prompt for song name to start
    song_name = input("Enter a song name to search: ").strip()
    if not song_name:
        song_name = "Yesterday"
        print(f"No input provided. Defaulting to '{song_name}'")
        
    # Instantiate the compiled graph
    graph = create_workflow()
    
    # Unique thread ID for state management
    thread_id = "interactive_run_thread"
    config = {"configurable": {"thread_id": thread_id}}
    
    # Track which logs have already been printed to avoid duplicate output
    printed_log_count = 0
    
    def print_latest_logs(state_values):
        nonlocal printed_log_count
        logs = state_values.get("logs", [])
        if len(logs) > printed_log_count:
            for log in logs[printed_log_count:]:
                print(f" {log}")
            printed_log_count = len(logs)

    # -------------------------------------------------------------
    # Step 1: Start Workflow & Search Candidates
    # -------------------------------------------------------------
    print("\n[System] Starting workflow thread...")
    events = graph.stream({"song_name": song_name}, config, stream_mode="values")
    
    # Consume events until first interrupt
    for event in events:
        print_latest_logs(event)
        
    # Get current state
    state = graph.get_state(config)
    
    # Verify we are at the first interrupt (User Selection)
    if "submit_to_hitl_queue" in state.next or not state.next:
        candidates = state.values.get("candidates", [])
        print_header("Human-in-the-Loop: Candidate Review")
        print(f"Results for '{song_name}':")
        for idx, candidate in enumerate(candidates):
            print(f"  {idx + 1}. [Title]: {candidate['title']} | [Artist]: {candidate['artist']} | [Album]: {candidate['album']} ({candidate['duration_seconds']}s)")
        print(f"  11. [None of these - Report Missing Song]")
            
        choice = input("\nEnter option number (1-11) or 'q' to quit: ").strip()
        if choice.lower() == 'q':
            print("[System] Exiting demo.")
            return
            
        try:
            choice_idx = int(choice) - 1
            if choice_idx == 10:
                selected_song = {
                    "id": "report_missing",
                    "title": song_name,
                    "artist": "Unknown",
                    "album": "Unknown",
                    "duration_seconds": 0,
                    "source_url": "",
                    "cover_url": ""
                }
            elif 0 <= choice_idx < len(candidates):
                selected_song = candidates[choice_idx]
            else:
                print(f"\n[System] Error: Invalid option number '{choice}'. Terminating workflow automatically.")
                return
        except ValueError:
            print(f"\n[System] Error: Non-numeric input '{choice}'. Terminating workflow automatically.")
            return
                
        # Update the state with user's choice
        if selected_song["id"] == "report_missing":
            print(f"\n[System] User opted to report song '{song_name}' as missing.")
            graph.update_state(config, {
                "selected_song_id": "report_missing",
                "selected_song": selected_song
            })
        else:
            print(f"\n[System] Selecting song: '{selected_song['title']}' by {selected_song['artist']}")
            graph.update_state(config, {
                "selected_song_id": selected_song["id"],
                "selected_song": selected_song,
                "audio_status": "pending",
                "cover_status": "pending",
                "artist_status": "pending",
                "track_status": "pending"
            })
        
        # -------------------------------------------------------------
        # Step 2: Resume workflow to queue and wait for Admin Review
        # -------------------------------------------------------------
        print("\n[System] Resuming workflow to submit to HITL queue...")
        events = graph.stream(None, config, stream_mode="values")
        for event in events:
            print_latest_logs(event)
            
    # Get current state after queue submission
    state = graph.get_state(config)
    
    # Verify we are at the second interrupt (Admin Review)
    if "admin_reviews_request" in state.next:
        selected_song = state.values.get("selected_song", {})
        print_header("Human-in-the-Loop: Admin Approval Request")
        print("Review Ingestion Details:")
        print(f"  - Title:   {selected_song.get('title')}")
        print(f"  - Artist:  {selected_song.get('artist')}")
        print(f"  - Album:   {selected_song.get('album')}")
        print(f"  - Source:  {selected_song.get('source_url')}")
        
        # Ask for approval decision
        decision = input("\nApprove ingestion request? (y/n): ").strip().lower()
        admin_approved = decision == 'y'
        notes = input("Enter admin review notes: ").strip()
        
        # Update the state with admin decision
        graph.update_state(config, {
            "admin_approved": admin_approved,
            "admin_notes": notes
        })
        
        # -------------------------------------------------------------
        # Step 3: Resume workflow to execute ingestion or reject
        # -------------------------------------------------------------
        print("\n[System] Resuming workflow to process admin decision...")
        events = graph.stream(None, config, stream_mode="values")
        for event in events:
            print_latest_logs(event)
            
    # Print execution final summary
    print_header("Workflow Execution Complete")
    final_state = graph.get_state(config).values
    
    print("Final Status Summary:")
    print(f"  - Search Song:    {final_state.get('song_name')}")
    print(f"  - Selected Song:  {final_state.get('selected_song', {}).get('title')} ({final_state.get('selected_song_id')})")
    print(f"  - Admin Approval: {final_state.get('admin_approved')} (Notes: '{final_state.get('admin_notes')}')")
    
    if final_state.get("admin_approved"):
        print(f"  - Audio Status:   {final_state.get('audio_status')} (URL: {final_state.get('audio_url')})")
        print(f"  - Cover Status:   {final_state.get('cover_status')} (URL: {final_state.get('cover_url')})")
        print(f"  - Artist ID:      {final_state.get('artist_id')} (Status: {final_state.get('artist_status')})")
        print(f"  - Track ID:       {final_state.get('track_id')} (Status: {final_state.get('track_status')})")
        print("\nResult: SUCCESS - Song ingested into database and available for streaming!")
    else:
        print("\nResult: REJECTED - Request was denied and requester has been notified.")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
