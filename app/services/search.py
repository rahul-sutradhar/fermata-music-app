from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.models.track import Track
from app.models.album import Album
from app.models.artist import Artist
from app.schemas.search import SearchResultItem, SearchResponse
from app.schemas.track import TrackResponse
from app.schemas.album import AlbumResponse
from app.schemas.artist import ArtistResponse


def _track_row_to_item(track: Track) -> SearchResultItem:
    return SearchResultItem(type="track", id=track.id, title=track.title, subtitle=track.artist_name)


def _album_row_to_item(album: Album) -> SearchResultItem:
    return SearchResultItem(type="album", id=album.id, title=album.title, subtitle=album.artist_name)


def _artist_row_to_item(artist: Artist) -> SearchResultItem:
    return SearchResultItem(type="artist", id=artist.id, title=artist.name, subtitle=None)



def search(*, db: Session, q: str, limit: int = 10) -> SearchResponse:
    from sqlalchemy import and_
    from sqlalchemy.orm import joinedload
    import difflib

    words = [w.strip() for w in q.split() if w.strip()]
    if not words:
        return SearchResponse(
            q=q,
            limit=limit,
            results=[],
            tracks=[],
            albums=[],
            artists=[],
        )

    # 1. Tracks Search (outerjoin Album and Artist so singles & album tracks both match)
    track_conditions = []
    for word in words:
        word_like = f"%{word}%"
        track_conditions.append(
            or_(
                Track.title.ilike(word_like),
                Album.title.ilike(word_like),
                Artist.name.ilike(word_like),
            )
        )
    tracks = db.scalars(
        select(Track)
        .outerjoin(Album, Track.album_id == Album.id)
        .outerjoin(Artist, or_(Track.artist_id == Artist.id, Album.artist_id == Artist.id))
        .where(and_(*track_conditions))
        .order_by(Track.id)
        .limit(limit)
    ).all()

    # 2. Albums Search (outerjoin Artist to match keywords in album title or artist name)
    album_conditions = []
    for word in words:
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

    # 3. Artists Search (match all keywords in artist name)
    artist_conditions = []
    for word in words:
        word_like = f"%{word}%"
        artist_conditions.append(Artist.name.ilike(word_like))
    artists = db.scalars(
        select(Artist)
        .where(and_(*artist_conditions))
        .order_by(Artist.id)
        .limit(limit)
    ).all()

    # --- Phase 2: Typo-Tolerance / Fuzzy Match Fallback ---
    THRESHOLD = 0.45  # Match strings with at least 45% character similarity

    if len(tracks) < limit:
        all_tracks = db.scalars(
            select(Track).options(
                joinedload(Track.album).joinedload(Album.artist)
            )
        ).all()
        
        scored_tracks = []
        for t in all_tracks:
            if any(x.id == t.id for x in tracks):
                continue
            
            score = difflib.SequenceMatcher(None, q.lower(), t.title.lower()).ratio()
            if t.album_title:
                score = max(score, difflib.SequenceMatcher(None, q.lower(), t.album_title.lower()).ratio())
            if t.artist_name:
                score = max(score, difflib.SequenceMatcher(None, q.lower(), t.artist_name.lower()).ratio())
            
            if score >= THRESHOLD:
                scored_tracks.append((t, score))
        
        scored_tracks.sort(key=lambda x: x[1], reverse=True)
        for t, s in scored_tracks:
            if len(tracks) >= limit:
                break
            tracks.append(t)

    if len(albums) < limit:
        all_albums = db.scalars(
            select(Album).options(joinedload(Album.artist))
        ).all()
        
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


    # --- Result Assembly ---
    items: list[SearchResultItem] = []
    items.extend([_track_row_to_item(t) for t in tracks])
    items.extend([_album_row_to_item(a) for a in albums])
    items.extend([_artist_row_to_item(ar) for ar in artists])

    # Trim to requested limit overall
    items = items[:limit]

    # Also provide legacy typed lists for consumers expecting structured responses
    from app.core.storage import get_audio_url

    track_objs = [
        TrackResponse(
            id=t.id,
            title=t.title,
            album_id=t.album_id,
            duration_seconds=t.duration_seconds,
            audio_url=get_audio_url(t.audio_file_key) if getattr(t, "audio_file_key", None) else None,
            cover_url=t.cover_url,
            album_title=t.album_title,
            artist_id=t.artist_id,
            artist_name=t.artist_name,
            lyrics=t.lyrics,
        )
        for t in tracks
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
