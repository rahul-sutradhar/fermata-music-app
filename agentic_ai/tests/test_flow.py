import os
import sys
from dotenv import load_dotenv

# Add the root directory of the project to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

load_dotenv()

from agentic_ai.src.graph import create_workflow

def run_test_scenario(approve: bool, song_name: str = "Yesterday", report_missing: bool = False):
    print(f"\n" + "=" * 60)
    print(f" EXECUTING TEST SCENARIO: {'APPROVAL' if approve else 'REJECTION'} ({song_name}, report_missing={report_missing}) ".center(60, "="))
    print("=" * 60)
    
    graph = create_workflow()
    thread_id = f"test_thread_{'approve' if approve else 'reject'}_{song_name.replace(' ', '_')}_{report_missing}"
    config = {"configurable": {"thread_id": thread_id}}
    
    # 1. Start graph execution with search query
    print("\n[System] Starting workflow thread...")
    events = graph.stream({"song_name": song_name}, config, stream_mode="values")
    for event in events:
        logs = event.get("logs", [])
        if logs:
            print(f"  {logs[-1]}")
            
    state = graph.get_state(config)
    
    # If no candidates are found (or search query returned 0), route_after_search goes to report_missing_song.
    # Since search_candidates has interrupt_after, we check state.next and resume to finish the report.
    if "report_missing_song" in state.next:
        print("\n[System] Resuming workflow to report missing song...")
        events = graph.stream(None, config, stream_mode="values")
        for event in events:
            logs = event.get("logs", [])
            if logs:
                print(f"  {logs[-1]}")
                
        final_state = graph.get_state(config).values
        print("\n" + "-" * 40)
        print(f" FINAL STATUS SUMMARY ".center(40, "-"))
        print("-" * 40)
        print(f"  Search Query:     {final_state.get('song_name')}")
        print(f"  Result:           SONG NOT FOUND (workflow terminated cleanly)")
        print("=" * 60 + "\n")
        return final_state
        
    print(f"\n[System] Interrupt reached. Next node: {state.next}")
    candidates = state.values.get("candidates", [])
    
    # Select candidate 1 or report missing
    if report_missing:
        selected_song = {
            "id": "report_missing",
            "title": song_name,
            "artist": "Unknown",
            "album": "Unknown",
            "duration_seconds": 0,
            "source_url": "",
            "cover_url": ""
        }
        print(f"[System] Simulating selection: None of these - Report Missing Song")
        graph.update_state(config, {
            "selected_song_id": "report_missing",
            "selected_song": selected_song
        })
    else:
        selected_song = candidates[0]
        print(f"[System] Simulating selection: '{selected_song['title']}' by {selected_song['artist']}")
        graph.update_state(config, {
            "selected_song_id": selected_song["id"],
            "selected_song": selected_song,
            "audio_status": "pending",
            "cover_status": "pending",
            "artist_status": "pending",
            "track_status": "pending"
        })
    
    # 2. Resume graph to HITL queue
    print("\n[System] Resuming workflow to submit to queue...")
    events = graph.stream(None, config, stream_mode="values")
    for event in events:
        logs = event.get("logs", [])
        if logs:
            print(f"  {logs[-1]}")
            
    state = graph.get_state(config)
    
    # If the user chose to report missing, the workflow will route directly to report_missing_song and complete.
    if not state.next:
        final_state = state.values
        print("\n" + "-" * 40)
        print(f" FINAL STATUS SUMMARY ".center(40, "-"))
        print("-" * 40)
        print(f"  Search Query:     {final_state.get('song_name')}")
        print(f"  Result:           REPORT FILED (user reported missing, workflow terminated cleanly)")
        print("=" * 60 + "\n")
        return final_state
        
    print(f"\n[System] Interrupt reached. Next node: {state.next}")
    
    # 3. Simulate Admin decision
    print(f"[System] Simulating admin decision. Approved: {approve}")
    graph.update_state(config, {
        "admin_approved": approve,
        "admin_notes": f"Automated test script review - {'Approved' if approve else 'Rejected'}"
    })
    
    # 4. Resume to end of workflow
    print("\n[System] Resuming workflow to process admin review...")
    events = graph.stream(None, config, stream_mode="values")
    for event in events:
        logs = event.get("logs", [])
        if logs:
            print(f"  {logs[-1]}")
            
    final_state = graph.get_state(config).values
    
    print("\n" + "-" * 40)
    print(f" FINAL STATUS SUMMARY ".center(40, "-"))
    print("-" * 40)
    print(f"  Search Query:     {final_state.get('song_name')}")
    print(f"  Selected Song:    {final_state.get('selected_song', {}).get('title')} by {final_state.get('selected_song', {}).get('artist')}")
    print(f"  Admin Decision:   {'APPROVED' if final_state.get('admin_approved') else 'REJECTED'}")
    
    if final_state.get("admin_approved"):
        print(f"  Audio Status:     {final_state.get('audio_status')}")
        print(f"  Audio URL:        {final_state.get('audio_url')}")
        print(f"  Cover Status:     {final_state.get('cover_status')}")
        print(f"  Cover URL:        {final_state.get('cover_url')}")
        print(f"  Artist ID:        {final_state.get('artist_id')} ({final_state.get('artist_status')})")
        print(f"  Track ID:         {final_state.get('track_id')} ({final_state.get('track_status')})")
        print("\n  Result: SUCCESS - Ingestion Pipeline executed completely in-memory.")
    else:
        print("\n  Result: REJECTED - Requester notified and ingestion pipeline bypassed.")
    print("=" * 60 + "\n")
    
    return final_state

# Formal test cases discovered by pytest
def test_approval_scenario():
    print("Running pytest approval flow...")
    final_state = run_test_scenario(approve=True)
    assert final_state.get("admin_approved") is True
    assert final_state.get("track_status") == "completed"
    assert final_state.get("track_id") == 9901
    assert final_state.get("audio_url") is not None
    assert final_state.get("cover_url") is not None
    assert final_state.get("artist_id") == 404

def test_rejection_scenario():
    print("Running pytest rejection flow...")
    final_state = run_test_scenario(approve=False)
    assert final_state.get("admin_approved") is False
    assert final_state.get("track_status") != "completed"
    assert final_state.get("track_id") is None

def test_missing_song_scenario():
    print("Running pytest missing song flow...")
    final_state = run_test_scenario(approve=True, song_name="Nonexistent Song Query")
    assert final_state.get("candidates") == []
    assert final_state.get("track_status") is None
    assert final_state.get("admin_approved") is None

def test_user_report_missing_scenario():
    print("Running pytest user report missing flow...")
    final_state = run_test_scenario(approve=True, song_name="Yesterday", report_missing=True)
    assert final_state.get("selected_song_id") == "report_missing"
    assert final_state.get("track_status") is None
    assert final_state.get("admin_approved") is None

if __name__ == "__main__":
    print("Starting Automated Workflow Tests...")
    run_test_scenario(approve=True)
    run_test_scenario(approve=False)
    run_test_scenario(approve=True, song_name="Nonexistent Song Query")
    run_test_scenario(approve=True, song_name="Yesterday", report_missing=True)
