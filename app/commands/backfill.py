"""Command to backfill vector embeddings and full-text search indexes for all existing tracks."""

import time
from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models.track import Track
from app.services.tracks import index_and_embed_track


def main():
    print("[Backfill] Starting search index and embedding backfill process...", flush=True)
    db = SessionLocal()
    try:
        # Fetch all tracks
        tracks = db.query(Track).all()
        total = len(tracks)
        print(f"[Backfill] Found {total} tracks to process.", flush=True)

        for idx, track in enumerate(tracks):
            print(f"[Backfill] ({idx + 1}/{total}) Indexing track {track.id}: '{track.title}' by '{track.artist_name}'...", flush=True)
            
            start_time = time.time()
            index_and_embed_track(db, track)
            db.commit()
            
            elapsed = time.time() - start_time
            # Throttle slightly to respect Hugging Face API rate limits
            sleep_time = max(0.1, 0.5 - elapsed)
            time.sleep(sleep_time)

        print("[Backfill] Completed indexing all tracks. Rebuilding pgvector HNSW indexes...", flush=True)
        db.execute(text("REINDEX TABLE tracks;"))
        db.execute(text("REINDEX TABLE lyric_chunks;"))
        db.commit()
        print("[Backfill] Indexes successfully rebuilt.", flush=True)
        print("[Backfill] Backfill process completed successfully!", flush=True)

    except Exception as e:
        print(f"[Backfill] Error during backfill: {str(e)}", flush=True)
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()
