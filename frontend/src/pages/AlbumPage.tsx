import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Music, Heart } from 'lucide-react'
import { getAlbum, getAlbumTracks } from '@/api/albums'
import { checkAlbumsInLibrary, likeAlbum, unlikeAlbum } from '@/api/library'
import { usePlayerStore } from '@/store/playerStore'
import type { Album, Track } from '@/types'
import TrackList from '@/components/TrackList'

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [album, setAlbum] = useState<Album | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState<boolean>(false)
  const [liking, setLiking] = useState(false)
  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const [albumData, trackData] = await Promise.all([
          getAlbum(Number(id)),
          getAlbumTracks(Number(id), 0, 50),
        ])
        setAlbum(albumData)
        setTracks(trackData)

        // Check if liked
        const likedMap = await checkAlbumsInLibrary([Number(id)]).catch(() => ({} as Record<number, boolean>))
        setLiked(likedMap[Number(id)] ?? false)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setQueue(tracks)
      setTrack(tracks[0])
    }
  }

  const handleToggleLike = async () => {
    if (!id || liking) return
    setLiking(true)
    try {
      if (liked) {
        await unlikeAlbum(Number(id))
        setLiked(false)
      } else {
        await likeAlbum(Number(id))
        setLiked(true)
      }
    } catch {
      // silent
    } finally {
      setLiking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!album) {
    return (
      <div className="py-20 text-center text-subtext">
        <p className="text-lg">Album not found</p>
      </div>
    )
  }

  // Gather unique genres from tracks
  const uniqueGenres = Array.from(
    new Set(tracks.map((t) => t.genres).filter(Boolean))
  )
  const genreText = uniqueGenres.length > 0 ? uniqueGenres.join(', ') : 'Music'

  return (
    <div className="animate-in fade-in duration-300">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-bold text-subtext hover:text-primary transition-colors cursor-pointer select-none bg-surface-highlight/40 hover:bg-surface-highlight/70 px-3 py-1.5 rounded-full border border-surface-highlight/20"
          title="Go Back"
        >
          ← Back
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-end gap-6 mb-8">
        {album.cover_url ? (
          <img
            src={album.cover_url}
            alt={album.title}
            className="w-48 h-48 rounded-lg object-cover shadow-2xl shrink-0 border border-surface-highlight/30"
          />
        ) : (
          <div className="w-48 h-48 rounded-lg bg-surface-highlight flex items-center justify-center shadow-2xl shrink-0 border border-surface-highlight/30">
            <Music size={64} className="text-subtext/40" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-subtext mb-1">Album</p>
          <div className="flex items-center gap-4 mb-2 flex-wrap">
            <h1 className="text-3xl md:text-5xl font-black tracking-tight truncate text-primary">{album.title}</h1>
            <button
              onClick={handlePlayAll}
              className="w-10 h-10 bg-spotify-green hover:bg-spotify-green-hover text-black rounded-full flex items-center justify-center hover:scale-105 transition-all shadow-lg shrink-0 cursor-pointer"
              title="Play Album"
              disabled={tracks.length === 0}
            >
              <Play size={18} className="ml-0.5 text-black" fill="currentColor" />
            </button>
          </div>
          <p className="text-sm font-semibold text-subtext flex flex-wrap items-center gap-1.5">
            <span className="text-primary hover:underline cursor-pointer">{album.artist_name || 'Unknown Artist'}</span>
            <span className="text-subtext/60">•</span>
            <span>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
            <span className="text-subtext/60">•</span>
            <span className="bg-surface-highlight/40 px-2.5 py-0.5 rounded-full text-xs text-primary font-medium">{genreText}</span>
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mb-6">
        {/* Like / Save album button */}
        <button
          onClick={handleToggleLike}
          disabled={liking}
          title={liked ? 'Remove from library' : 'Save to library'}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all cursor-pointer shadow ${
            liked
              ? 'border-spotify-green text-spotify-green bg-spotify-green/10 hover:bg-spotify-green/20'
              : 'border-surface-highlight text-subtext hover:text-primary hover:border-primary bg-surface-highlight/50'
          } ${liking ? 'opacity-60 cursor-wait' : ''}`}
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          {liked ? 'Saved' : 'Save to Library'}
        </button>
      </div>

      {/* Tracks: Scrollable list */}
      <div className="max-h-[500px] overflow-y-auto scrollbar-thin rounded-xl border border-surface-highlight/30 p-2 bg-surface-highlight/5">
        <TrackList tracks={tracks} />
      </div>
    </div>
  )
}
