import os
from sqlalchemy import select, and_, or_, text, func, bindparam, Float
from sqlalchemy.orm import Session

from app.models.track import Track, SQLiteFriendlyVector
from app.models.album import Album
from app.models.artist import Artist
from app.models.lyric_chunk import LyricChunk
from app.models.library import UserLibrary
from app.models.player import RecentlyPlayed

from app.schemas.search import SearchResultItem, SearchResponse
from app.schemas.track import TrackResponse
from app.schemas.album import AlbumResponse
from app.schemas.artist import ArtistResponse


def _track_row_to_item(track: Track, snippet: str | None = None) -> SearchResultItem:
    return SearchResultItem(
        type="track", 
        id=track.id, 
        title=track.title, 
        subtitle=track.artist_name,
        matched_snippet=snippet
    )


def _album_row_to_item(album: Album) -> SearchResultItem:
    return SearchResultItem(type="album", id=album.id, title=album.title, subtitle=album.artist_name, matched_snippet=None)


def _artist_row_to_item(artist: Artist) -> SearchResultItem:
    return SearchResultItem(type="artist", id=artist.id, title=artist.name, subtitle=None, matched_snippet=None)


def search(*, db: Session, q: str, limit: int = 10) -> SearchResponse:
    import difflib
    from sqlalchemy.orm import joinedload

    # Cleanup query terms
    terms = [w.strip() for w in q.split() if w.strip()]
    if not terms:
        return SearchResponse(
            q=q,
            limit=limit,
            results=[],
            tracks=[],
            albums=[],
            artists=[],
        )

    # 1. Fetch query vector embedding via HF API (with graceful fallback if unconfigured/fails)
    q_embedding = None
    try:
        is_sqlite = db.get_bind().dialect.name == "sqlite"
    except Exception:
        is_sqlite = False

    if not is_sqlite:
        try:
            from app.services.embedding import get_embedding
            import numpy as np
            raw = get_embedding(q)
            if isinstance(raw, list) and len(raw) == 384:
                q_embedding = np.array(raw, dtype=np.float32)
            else:
                print(f"[Search Service] Embedding returned unexpected shape: {type(raw)}, len={len(raw) if isinstance(raw, list) else 'N/A'}", flush=True)
        except Exception as e:
            print(f"[Search Service] Failed to retrieve query embedding: {str(e)}", flush=True)

    # Get search tuning weights from environment or use defaults
    w_word = float(os.getenv("SEARCH_WORD_MATCH_WEIGHT", "0.5"))
    w_sem = float(os.getenv("SEARCH_SEMANTIC_WEIGHT", "0.3"))
    w_lyric = float(os.getenv("SEARCH_LYRIC_WEIGHT", "0.15"))
    w_pop = float(os.getenv("SEARCH_POPULARITY_WEIGHT", "0.05"))

    # Adjust weights if embedding generation failed (allocate semantic weight to text keyword match)
    if q_embedding is None:
        w_word_lyric_sum = w_word + w_lyric
        if w_word_lyric_sum > 0:
            w_word = w_word / w_word_lyric_sum
            w_lyric = w_lyric / w_word_lyric_sum
        w_sem = 0.0
        w_pop = 0.0

    # Prefix wildcard tsquery for partial keyword matching (e.g. 'blind:* & l:*')
    prefix_query_str = " & ".join(f"{t}:*" for t in terms)
    prefix_tsquery = func.to_tsquery("english", prefix_query_str)

    # Candidates dictionary: track_id -> dict metrics
    candidates = {}

    # Signal A: Exact/Prefix FTS match on Track Metadata
    if is_sqlite:
        sqlite_conditions = []
        for word in terms:
            word_like = f"%{word}%"
            sqlite_conditions.append(
                or_(
                    Track.title.ilike(word_like),
                    Album.title.ilike(word_like),
                    Artist.name.ilike(word_like),
                    Track.genres.ilike(word_like),
                )
            )
        try:
            sqlite_tracks = db.scalars(
                select(Track)
                .outerjoin(Album, Track.album_id == Album.id)
                .outerjoin(Artist, Track.artist_id == Artist.id)
                .where(and_(*sqlite_conditions))
                .limit(limit)
            ).all()
            for track in sqlite_tracks:
                candidates[track.id] = {
                    "track": track,
                    "word_score": 1.0,
                    "semantic_score": 0.0,
                    "lyric_score": 0.0,
                    "snippet": None
                }
        except Exception as e:
            print(f"[Search Service] SQLite track query failed: {str(e)}", flush=True)
    else:
        try:
            fts_tracks = db.execute(
                select(
                    Track,
                    func.ts_rank_cd(Track.search_tsv, prefix_tsquery).label("rank")
                )
                .where(Track.search_tsv.op("@@")(prefix_tsquery))
                .order_by(text("rank DESC"))
                .limit(50)
            ).all()

            for track, rank in fts_tracks:
                score = min(1.0, float(rank) if rank else 0.0)
                candidates[track.id] = {
                    "track": track,
                    "word_score": score,
                    "semantic_score": 0.0,
                    "lyric_score": 0.0,
                    "snippet": None
                }
        except Exception as e:
            print(f"[Search Service] Track FTS query failed: {str(e)}", flush=True)

        # Signal A-fallback: ILIKE title/artist match — catches tracks with no search_tsv (not yet re-indexed)
        try:
            ilike_conditions = [Track.title.ilike(f"%{w}%") for w in terms]
            ilike_tracks = db.scalars(
                select(Track)
                .where(or_(*ilike_conditions))
                .limit(50)
            ).all()
            for track in ilike_tracks:
                if track.id not in candidates:
                    candidates[track.id] = {
                        "track": track,
                        "word_score": 0.5,   # lower than FTS rank, but still surfaced
                        "semantic_score": 0.0,
                        "lyric_score": 0.0,
                        "snippet": None
                    }
        except Exception as e:
            print(f"[Search Service] Track ILIKE fallback failed: {str(e)}", flush=True)

    # Signal B: Semantic Vector Search on Track metadata embedding (Skipped on SQLite)
    if q_embedding is not None:
        try:
            sem_tracks = db.execute(
                select(
                    Track,
                    (1.0 - Track.embedding.op("<=>", return_type=Float)(bindparam("q_emb_track", type_=SQLiteFriendlyVector))).label("similarity")
                )
                .order_by(text("similarity DESC"))
                .limit(50),
                {"q_emb_track": q_embedding}
            ).all()

            for track, similarity in sem_tracks:
                score = max(0.0, float(similarity) if similarity is not None else 0.0)
                if track.id not in candidates:
                    candidates[track.id] = {
                        "track": track,
                        "word_score": 0.0,
                        "semantic_score": score,
                        "lyric_score": 0.0,
                        "snippet": None
                    }
                else:
                    candidates[track.id]["semantic_score"] = max(candidates[track.id]["semantic_score"], score)
        except Exception as e:
            print(f"[Search Service] Track Semantic query failed: {str(e)}", flush=True)

    # Signal C: Lyric FTS Search (using GIN index and ts_headline snippet highlighting)
    if is_sqlite:
        try:
            sqlite_lyric_tracks = db.scalars(
                select(Track)
                .where(Track.lyrics.ilike(f"%{q}%"))
                .limit(limit)
            ).all()
            for track in sqlite_lyric_tracks:
                snippet = None
                if track.lyrics:
                    idx = track.lyrics.lower().find(q.lower())
                    if idx != -1:
                        start = max(0, idx - 30)
                        end = min(len(track.lyrics), idx + 30)
                        snippet = f"... {track.lyrics[start:end]} ..."
                if track.id not in candidates:
                    candidates[track.id] = {
                        "track": track,
                        "word_score": 0.0,
                        "semantic_score": 0.0,
                        "lyric_score": 1.0,
                        "snippet": snippet
                    }
                else:
                    candidates[track.id]["lyric_score"] = 1.0
                    candidates[track.id]["snippet"] = snippet
        except Exception as e:
            print(f"[Search Service] SQLite lyric query failed: {str(e)}", flush=True)
    else:
        try:
            lyric_fts = db.execute(
                select(
                    Track,
                    func.ts_rank_cd(Track.lyrics_tsv, prefix_tsquery).label("rank"),
                    func.ts_headline("english", Track.lyrics, prefix_tsquery, "StartSel=<b>, StopSel=</b>, MaxWords=15, MinWords=5").label("snippet")
                )
                .where(Track.lyrics_tsv.op("@@")(prefix_tsquery))
                .order_by(text("rank DESC"))
                .limit(50)
            ).all()

            for track, rank, snippet in lyric_fts:
                score = min(1.0, float(rank) if rank else 0.0)
                if track.id not in candidates:
                    candidates[track.id] = {
                        "track": track,
                        "word_score": 0.0,
                        "semantic_score": 0.0,
                        "lyric_score": score,
                        "snippet": snippet
                    }
                else:
                    candidates[track.id]["lyric_score"] = max(candidates[track.id]["lyric_score"], score)
                    if not candidates[track.id]["snippet"]:
                        candidates[track.id]["snippet"] = snippet
        except Exception as e:
            print(f"[Search Service] Lyric FTS query failed: {str(e)}", flush=True)

    # Signal D: Semantic Lyric Chunk Search
    if q_embedding is not None:
        try:
            lyric_sem = db.execute(
                select(
                    LyricChunk.track_id,
                    (1.0 - LyricChunk.embedding.op("<=>", return_type=Float)(bindparam("q_emb_lyric", type_=SQLiteFriendlyVector))).label("similarity"),
                    LyricChunk.text
                )
                .order_by(text("similarity DESC"))
                .limit(50),
                {"q_emb_lyric": q_embedding}
            ).all()

            for track_id, similarity, chunk_text in lyric_sem:
                score = max(0.0, float(similarity) if similarity is not None else 0.0)
                if track_id not in candidates:
                    track = db.get(Track, track_id)
                    if not track:
                        continue
                    candidates[track_id] = {
                        "track": track,
                        "word_score": 0.0,
                        "semantic_score": 0.0,
                        "lyric_score": score,
                        "snippet": chunk_text
                    }
                else:
                    candidates[track_id]["lyric_score"] = max(candidates[track_id]["lyric_score"], score)
                    if not candidates[track_id]["snippet"]:
                        candidates[track_id]["snippet"] = chunk_text
        except Exception as e:
            print(f"[Search Service] Lyric Chunk Semantic query failed: {str(e)}", flush=True)

    # 2. Fetch track popularity metrics (likes and plays)
    candidate_ids = list(candidates.keys())
    likes_map = {cid: 0 for cid in candidate_ids}
    plays_map = {cid: 0 for cid in candidate_ids}

    if candidate_ids:
        try:
            likes = db.execute(
                select(UserLibrary.track_id, func.count(UserLibrary.user_id))
                .where(UserLibrary.track_id.in_(candidate_ids))
                .group_by(UserLibrary.track_id)
            ).all()
            for tid, count in likes:
                likes_map[tid] = count

            plays = db.execute(
                select(RecentlyPlayed.track_id, func.count(RecentlyPlayed.id))
                .where(RecentlyPlayed.track_id.in_(candidate_ids))
                .group_by(RecentlyPlayed.track_id)
            ).all()
            for tid, count in plays:
                plays_map[tid] = count
        except Exception as e:
            print(f"[Search Service] Popularity metrics retrieval failed: {str(e)}", flush=True)

    # 3. Score blending & Exact-title matching boosts
    scored_tracks = []
    for tid, data in candidates.items():
        track = data["track"]
        
        # Check for exact song title match (case-insensitive)
        is_exact_title = track.title.strip().lower() == q.strip().lower()
        exact_boost = 10.0 if is_exact_title else 0.0

        # Calculate popularity score (cap at 10 plays + likes)
        pop_score = min(1.0, (likes_map[tid] + plays_map[tid]) / 10.0)

        # Blend scoring
        final_score = (
            (w_word * data["word_score"]) +
            (w_sem * data["semantic_score"]) +
            (w_lyric * data["lyric_score"]) +
            (w_pop * pop_score) +
            exact_boost
        )

        scored_tracks.append((track, final_score, data["snippet"]))

    # Sort tracks by final blended score descending
    scored_tracks.sort(key=lambda x: x[1], reverse=True)
    
    # Slice to top tracks limit
    top_scored_tracks = scored_tracks[:limit]
    tracks_result = [item[0] for item in top_scored_tracks]
    snippets_map = {item[0].id: item[2] for item in top_scored_tracks}

    # 4. Standard Albums Search
    album_conditions = []
    for word in terms:
        word_like = f"%{word}%"
        album_conditions.append(
            or_(
                Album.title.ilike(word_like),
                Artist.name.ilike(word_like),
            )
        )
    albums = db.scalars(
        select(Album)
        .outerjoin(Artist, Album.artist_id == Artist.id)
        .where(and_(*album_conditions))
        .order_by(Album.id)
        .limit(limit)
    ).all()

    # 5. Standard Artists Search
    artist_conditions = []
    for word in terms:
        word_like = f"%{word}%"
        artist_conditions.append(Artist.name.ilike(word_like))
    artists = db.scalars(
        select(Artist)
        .where(and_(*artist_conditions))
        .order_by(Artist.id)
        .limit(limit)
    ).all()

    # Typo tolerance fallback for albums and artists if limits not reached
    THRESHOLD = 0.45
    if len(albums) < limit:
        all_albums = db.scalars(select(Album).options(joinedload(Album.artist))).all()
        scored_albums = []
        for a in all_albums:
            if any(x.id == a.id for x in albums):
                continue
            score = difflib.SequenceMatcher(None, q.lower(), a.title.lower()).ratio()
            if a.artist_name:
                score = max(score, difflib.SequenceMatcher(None, q.lower(), a.artist_name.lower()).ratio())
            if score >= THRESHOLD:
                scored_albums.append((a, score))
        scored_albums.sort(key=lambda x: x[1], reverse=True)
        for a, s in scored_albums:
            if len(albums) >= limit:
                break
            albums.append(a)

    if len(artists) < limit:
        all_artists = db.scalars(select(Artist)).all()
        scored_artists = []
        for ar in all_artists:
            if any(x.id == ar.id for x in artists):
                continue
            score = difflib.SequenceMatcher(None, q.lower(), ar.name.lower()).ratio()
            if score >= THRESHOLD:
                scored_artists.append((ar, score))
        scored_artists.sort(key=lambda x: x[1], reverse=True)
        for ar, s in scored_artists:
            if len(artists) >= limit:
                break
            artists.append(ar)

    # 6. Assembly
    items: list[SearchResultItem] = []
    items.extend([_track_row_to_item(t, snippets_map.get(t.id)) for t in tracks_result])
    items.extend([_album_row_to_item(a) for a in albums])
    items.extend([_artist_row_to_item(ar) for ar in artists])
    items = items[:limit]

    from app.core.storage import get_audio_url

    track_objs = [
        TrackResponse(
            id=t.id,
            title=t.title,
            album_id=t.album_id,
            duration_seconds=t.duration_seconds,
            audio_url=get_audio_url(t.audio_file_key, version=int(t.updated_at.timestamp()) if getattr(t, "updated_at", None) else None) if getattr(t, "audio_file_key", None) else None,
            cover_url=t.cover_url,
            album_title=t.album_title,
            artist_id=t.artist_id,
            artist_name=t.artist_name,
            lyrics=t.lyrics,
            matched_snippet=snippets_map.get(t.id)
        )
        for t in tracks_result
    ]
    album_objs = [
        AlbumResponse(
            id=a.id,
            title=a.title,
            artist_id=a.artist_id,
            artist_name=a.artist_name,
            cover_url=a.cover_url,
        )
        for a in albums
    ]
    artist_objs = [ArtistResponse(id=ar.id, name=ar.name) for ar in artists]

    return SearchResponse(
        q=q,
        limit=limit,
        results=items,
        tracks=track_objs,
        albums=album_objs,
        artists=artist_objs,
    )
