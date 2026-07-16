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
    return SearchResultItem(type="track", id=track.id, title=track.title, subtitle=None)


def _album_row_to_item(album: Album) -> SearchResultItem:
    return SearchResultItem(type="album", id=album.id, title=album.title, subtitle=None)


def _artist_row_to_item(artist: Artist) -> SearchResultItem:
    return SearchResultItem(type="artist", id=artist.id, title=artist.name, subtitle=None)


def search(*, db: Session, q: str, limit: int = 10) -> SearchResponse:
    q_like = f"%{q}%"

    # include tracks that match the query directly or belong to albums/artists that match
    tracks = db.scalars(
        select(Track)
        .join(Album)
        .join(Artist)
        .where(
            or_(
                Track.title.ilike(q_like),
                Album.title.ilike(q_like),
                Artist.name.ilike(q_like),
            )
        )
        .order_by(Track.id)
        .limit(limit)
    ).all()
    albums = db.scalars(
        select(Album).where(Album.title.ilike(q_like)).order_by(Album.id).limit(limit)
    ).all()
    artists = db.scalars(
        select(Artist).where(Artist.name.ilike(q_like)).order_by(Artist.id).limit(limit)
    ).all()

    items: list[SearchResultItem] = []
    items.extend([_track_row_to_item(t) for t in tracks])
    items.extend([_album_row_to_item(a) for a in albums])
    items.extend([_artist_row_to_item(ar) for ar in artists])

    # Trim to requested limit overall
    items = items[:limit]

    # Also provide legacy typed lists for consumers expecting structured responses
    track_objs = [
        TrackResponse(
            id=t.id,
            title=t.title,
            album_id=t.album_id,
            duration_seconds=t.duration_seconds,
            audio_url=getattr(t, "audio_url", None),
        )
        for t in tracks
    ]
    album_objs = [AlbumResponse(id=a.id, title=a.title, artist_id=a.artist_id) for a in albums]
    artist_objs = [ArtistResponse(id=ar.id, name=ar.name) for ar in artists]

    return SearchResponse(
        q=q,
        limit=limit,
        results=items,
        tracks=track_objs,
        albums=album_objs,
        artists=artist_objs,
    )
