import json
import random
import numpy as np
from typing import List, Dict, Optional, Any
from sqlalchemy import select, func, text, bindparam, Float
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.cache import get_redis, get_memory_limiter
from app.models.track import Track, SQLiteFriendlyVector
from app.models.library import UserLibrary
from app.models.player import RecentlyPlayed
from app.models.user import User

# Cache expiration for autoplay session (12 hours)
CACHE_EXPIRE = 43200


class SessionStateManager:
    """Manages session play history to avoid loops and repeats in autoplay."""

    def __init__(self) -> None:
        self.redis = get_redis()
        self.memory = get_memory_limiter()

    def get_played_ids(self, session_key: str) -> List[int]:
        cache_key = f"autoplay:session:{session_key}"
        try:
            if self.redis is not None:
                data = self.redis.get(cache_key)
                if data:
                    return json.loads(data).get("played_ids", [])
            else:
                data = self.memory.get(cache_key)
                if data:
                    return data.get("played_ids", [])
        except Exception as e:
            print(f"[Autoplay Session] Read failed: {e}", flush=True)
        return []

    def set_played_ids(self, session_key: str, played_ids: List[int]) -> None:
        cache_key = f"autoplay:session:{session_key}"
        value = {"played_ids": played_ids}
        try:
            if self.redis is not None:
                self.redis.setex(cache_key, CACHE_EXPIRE, json.dumps(value))
            else:
                self.memory.set(cache_key, value, CACHE_EXPIRE)
        except Exception as e:
            print(f"[Autoplay Session] Write failed: {e}", flush=True)


def get_user_genre_profile(db: Session, user_id: int) -> Dict[str, float]:
    """Builds a normalized genre affinity profile for the user based on liked and recent tracks."""
    genre_counts: Dict[str, int] = {}
    total_tracks_counted = 0

    # 1. Fetch liked tracks
    liked_tracks = db.scalars(
        select(Track)
        .join(UserLibrary, Track.id == UserLibrary.track_id)
        .where(UserLibrary.user_id == user_id)
    ).all()

    # 2. Fetch recently played tracks
    recent_tracks = db.scalars(
        select(Track)
        .join(RecentlyPlayed, Track.id == RecentlyPlayed.track_id)
        .where(RecentlyPlayed.user_id == user_id)
        .order_by(RecentlyPlayed.played_at.desc())
        .limit(50)
    ).all()

    # Combine both lists (uniquely by id to avoid double counting)
    seen_ids = set()
    combined_tracks = []
    for t in liked_tracks + recent_tracks:
        if t.id not in seen_ids:
            seen_ids.add(t.id)
            combined_tracks.append(t)

    for t in combined_tracks:
        if t.genres:
            genres_list = [g.strip().lower() for g in t.genres.split(",") if g.strip()]
            for g in genres_list:
                genre_counts[g] = genre_counts.get(g, 0) + 1
                total_tracks_counted += 1

    if not total_tracks_counted:
        return {}

    # Normalize weights
    return {g: count / total_tracks_counted for g, count in genre_counts.items()}


def get_next_autoplay_track(
    *,
    db: Session,
    current_track_id: Optional[int] = None,
    session_id: Optional[str] = None,
    user_id: Optional[int] = None
) -> Track:
    """
    Computes a session's rolling vibe vector, scores candidates using cosine similarity,
    user genre affinity, and popularity, and picks the next track using a weighted-random choice.
    """
    # 1. Resolve session key
    if session_id:
        session_key = f"session_{session_id}"
    elif user_id:
        session_key = f"user_{user_id}"
    else:
        # If neither is provided, create a transient random session key
        session_key = f"transient_{random.randint(100000, 999999)}"

    state_mgr = SessionStateManager()
    played_ids = state_mgr.get_played_ids(session_key)

    # If a current track is playing, add it to played list
    if current_track_id and current_track_id not in played_ids:
        played_ids.append(current_track_id)
        state_mgr.set_played_ids(session_key, played_ids)

    # 2. Vibe Vector computation (Weighted average of last 3-5 tracks)
    vibe_vector: Optional[np.ndarray] = None
    recent_ids = played_ids[-5:][::-1]  # Get last 5 tracks, newest first

    if recent_ids:
        # Fetch embeddings for these tracks
        recent_tracks = db.scalars(
            select(Track).where(Track.id.in_(recent_ids))
        ).all()
        
        # Build map of track_id to embedding
        emb_map = {t.id: t.embedding for t in recent_tracks if t.embedding is not None}
        
        # We align embeddings to the chronological played order (newest first)
        matched_embs = []
        for rid in recent_ids:
            if rid in emb_map:
                matched_embs.append(np.array(emb_map[rid], dtype=np.float32))

        if matched_embs:
            # Newer songs get more weight
            base_weights = [0.4, 0.3, 0.15, 0.1, 0.05]
            used_weights = base_weights[:len(matched_embs)]
            total_w = sum(used_weights)
            normalized_weights = [w / total_w for w in used_weights]

            # Weighted average
            vibe_vector = sum(emb * w for emb, w in zip(matched_embs, normalized_weights))

    # Cold start fallback if vibe vector could not be computed
    if vibe_vector is None:
        if current_track_id:
            curr_track = db.get(Track, current_track_id)
            if curr_track and curr_track.embedding is not None:
                vibe_vector = np.array(curr_track.embedding, dtype=np.float32)

    # 3. Retrieve candidates excluding played tracks
    candidates_list: List[Dict[str, Any]] = []
    is_sqlite = db.bind.dialect.name == "sqlite"

    if vibe_vector is None:
        # Completely cold start (no vibe/seed): fall back to most popular/any tracks
        # Fetch tracks not played yet
        query = select(Track).where(Track.id.not_in(played_ids) if played_ids else True).limit(30)
        tracks = db.scalars(query).all()
        for t in tracks:
            candidates_list.append({"track": t, "similarity": 0.5})  # neutral similarity
    else:
        # Query closest tracks to vibe_vector by cosine distance
        if is_sqlite:
            # SQLite fallback: fetch tracks and compute cosine similarity in Python
            all_tracks = db.scalars(
                select(Track)
                .where(Track.id.not_in(played_ids) if played_ids else True)
                .where(Track.embedding != None)
                .limit(200)
            ).all()
            
            scored = []
            vibe_norm = np.linalg.norm(vibe_vector)
            if vibe_norm > 1e-8:
                for t in all_tracks:
                    emb = np.array(t.embedding, dtype=np.float32)
                    emb_norm = np.linalg.norm(emb)
                    if emb_norm > 1e-8:
                        sim = float(np.dot(emb, vibe_vector) / (emb_norm * vibe_norm))
                        # Cosine distance = 1 - sim. Cosine similarity = sim.
                        scored.append((t, sim))
                scored.sort(key=lambda x: x[1], reverse=True)
                for t, sim in scored[:30]:
                    candidates_list.append({"track": t, "similarity": sim})
        else:
            # PostgreSQL pgvector similarity query
            stmt = select(
                Track,
                (1.0 - Track.embedding.op("<=>", return_type=Float)(bindparam("vibe", type_=SQLiteFriendlyVector))).label("similarity")
            ).where(
                Track.id.not_in(played_ids) if played_ids else True
            ).where(
                Track.embedding != None
            ).order_by(
                text("similarity DESC")
            ).limit(30)

            res = db.execute(stmt, {"vibe": vibe_vector.tolist()}).all()
            for t, sim in res:
                candidates_list.append({"track": t, "similarity": float(sim) if sim is not None else 0.5})

    # If no candidate tracks left (e.g. user played all tracks), reset played history and retry
    if not candidates_list:
        if played_ids:
            state_mgr.set_played_ids(session_key, [])
            return get_next_autoplay_track(db=db, current_track_id=current_track_id, session_id=session_id, user_id=user_id)
        # If still empty (e.g. database has no tracks), raise exception
        raise ValueError("No tracks available in the database for autoplay.")

    # 4. Fetch user genre affinity profile
    user_affinity = {}
    if user_id:
        try:
            user_affinity = get_user_genre_profile(db, user_id)
        except Exception as e:
            print(f"[Autoplay] Genre profile calculation failed: {e}", flush=True)

    # 5. Retrieve popularity metrics for candidate tracks
    candidate_ids = [c["track"].id for c in candidates_list]
    likes_map = {cid: 0 for cid in candidate_ids}
    plays_map = {cid: 0 for cid in candidate_ids}
    
    if candidate_ids:
        try:
            # Count likes in library
            likes = db.execute(
                select(UserLibrary.track_id, func.count(UserLibrary.user_id))
                .where(UserLibrary.track_id.in_(candidate_ids))
                .group_by(UserLibrary.track_id)
            ).all()
            for tid, count in likes:
                likes_map[tid] = count

            # Count plays in history
            plays = db.execute(
                select(RecentlyPlayed.track_id, func.count(RecentlyPlayed.id))
                .where(RecentlyPlayed.track_id.in_(candidate_ids))
                .group_by(RecentlyPlayed.track_id)
            ).all()
            for tid, count in plays:
                plays_map[tid] = count
        except Exception as e:
            print(f"[Autoplay] Popularity query failed: {e}", flush=True)

    # Resolve last played artist for variety protection
    last_artist_id = None
    if played_ids:
        last_track = db.get(Track, played_ids[-1])
        if last_track:
            last_artist_id = last_track.effective_artist_id

    # 6. Apply scoring logic and artist variety filtering
    scored_candidates = []
    for cand in candidates_list:
        track = cand["track"]
        sim = cand["similarity"]
        tid = track.id

        # Hard Rule: Artist Variety Protection
        # Skip same artist in a row if we have plenty of candidates
        if last_artist_id is not None and track.effective_artist_id == last_artist_id:
            if len(candidates_list) > 3:
                continue

        # Compute User Genre Affinity
        track_affinity = 0.0
        if user_affinity and track.genres:
            track_genres = [g.strip().lower() for g in track.genres.split(",") if g.strip()]
            matching_scores = [user_affinity.get(g, 0.0) for g in track_genres]
            if matching_scores:
                track_affinity = max(matching_scores)

        # Compute Popularity score (capped at 1.0)
        pop_score = min(1.0, (likes_map[tid] + plays_map[tid]) / 10.0)

        # Scoring formula
        score = (0.6 * sim) + (0.25 * track_affinity) + (0.15 * pop_score)
        scored_candidates.append((track, score))

    # If all candidates got filtered out by artist variety filter, fallback to unfiltered candidates
    if not scored_candidates:
        for cand in candidates_list:
            track = cand["track"]
            tid = track.id
            track_affinity = 0.0
            if user_affinity and track.genres:
                track_genres = [g.strip().lower() for g in track.genres.split(",") if g.strip()]
                matching_scores = [user_affinity.get(g, 0.0) for g in track_genres]
                if matching_scores:
                    track_affinity = max(matching_scores)
            pop_score = min(1.0, (likes_map[tid] + plays_map[tid]) / 10.0)
            score = (0.6 * cand["similarity"]) + (0.25 * track_affinity) + (0.15 * pop_score)
            scored_candidates.append((track, score))

    # Sort candidates by score descending
    scored_candidates.sort(key=lambda x: x[1], reverse=True)

    # 7. Weighted-Random Pick from top 10 candidates
    top_candidates = scored_candidates[:10]
    tracks_choices = [item[0] for item in top_candidates]
    scores = [item[1] for item in top_candidates]

    # Convert scores to non-negative weights (ensure epsilon > 0)
    weights = [max(0.001, s) for s in scores]

    selected_track = random.choices(tracks_choices, weights=weights, k=1)[0]

    # Save to play history list
    played_ids.append(selected_track.id)
    state_mgr.set_played_ids(session_key, played_ids)

    return selected_track
