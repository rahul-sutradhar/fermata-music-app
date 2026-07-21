import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Play, Music, Heart } from 'lucide-react'
import { getAlbum, getAlbumTracks } from '@/api/albums'
import { checkAlbumsInLibrary, likeAlbum, unlikeAlbum } from '@/api/library'
import { usePlayerStore } from '@/store/playerStore'
import type { Album, Track } from '@/types'
import TrackList from '@/components/TrackList'

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>()
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-end gap-6 mb-8">
        {album.cover_url ? (
          <img
            src={album.cover_url}
            alt={album.title}
            className="w-48 h-48 rounded-lg object-cover shadow-2xl shrink-0"
          />
        ) : (
          <div className="w-48 h-48 rounded-lg bg-surface-highlight flex items-center justify-center shadow-2xl shrink-0">
            <Music size={64} className="text-subtext/40" />
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-subtext mb-1">Album</p>
          <h1 className="text-4xl font-bold mb-2 truncate">{album.title}</h1>
          <p className="text-sm text-subtext">
            {album.artist_name || 'Unknown Artist'} • {tracks.length} track{tracks.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handlePlayAll}
          className="w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 hover:bg-spotify-green-hover transition-all shadow-lg"
        >
          <Play size={22} className="text-black ml-0.5" fill="currentColor" />
        </button>

        {/* Like / Save album button */}
        <button
          onClick={handleToggleLike}
          disabled={liking}
          title={liked ? 'Remove from library' : 'Save to library'}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all shadow ${
            liked
              ? 'border-spotify-green text-spotify-green bg-spotify-green/10 hover:bg-spotify-green/20'
              : 'border-surface-highlight text-subtext hover:text-primary hover:border-primary bg-surface-highlight/50'
          } ${liking ? 'opacity-60 cursor-wait' : ''}`}
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          {liked ? 'Saved' : 'Save to Library'}
        </button>
      </div>

      {/* Tracks */}
      <TrackList tracks={tracks} />
    </div>
  )
}
