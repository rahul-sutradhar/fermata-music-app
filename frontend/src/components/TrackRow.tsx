import { Play, Pause, MoreHorizontal, Clock, Heart, Music } from 'lucide-react'
import { useState, useEffect } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import type { Track } from '@/types'
import AddToPlaylistMenu from './AddToPlaylistMenu'
import { checkLibrary, addToLibrary, removeFromLibrary } from '@/api/library'

function formatDuration(seconds: number | null) {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${Math.round(s).toString().padStart(2, '0')}`
}

interface Props {
  track: Track
  index: number
  tracks: Track[]
  onPlay?: (track: Track) => void
}

export default function TrackRow({ track, index, tracks, onPlay }: Props) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const [showMenu, setShowMenu] = useState(false)
  const [liked, setLiked] = useState<boolean | null>(null)
  const [liking, setLiking] = useState(false)

  const isActive = currentTrack?.id === track.id
  const isCurrentlyPlaying = isActive && isPlaying

  // Check if this track is in the library on mount
  useEffect(() => {
    let cancelled = false
    checkLibrary([track.id])
      .then((res) => { if (!cancelled) setLiked(res[track.id] ?? false) })
      .catch(() => { if (!cancelled) setLiked(false) })
    return () => { cancelled = true }
  }, [track.id])

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (liking || liked === null) return
    setLiking(true)
    try {
      if (liked) {
        await removeFromLibrary([track.id])
        setLiked(false)
        // Notify Library page to refresh
        window.dispatchEvent(new Event('library-updated'))
      } else {
        await addToLibrary([track.id])
        setLiked(true)
        window.dispatchEvent(new Event('library-updated'))
      }
    } catch {
      // silent
    } finally {
      setLiking(false)
    }
  }

  const handlePlay = () => {
    if (isActive) {
      setIsPlaying(!isPlaying)
    } else {
      setQueue(tracks)
      setTrack(track)
      setIsPlaying(true)
    }
    if (onPlay) {
      onPlay(track)
    }
  }

  return (
    <div
      className={`group grid grid-cols-[32px_1fr_32px_40px] md:grid-cols-[32px_1fr_1fr_32px_80px_40px] gap-2 md:gap-4 items-center px-2 md:px-4 py-2 rounded-md transition-colors cursor-pointer ${
        isActive ? 'bg-surface-highlight/80' : 'hover:bg-surface-highlight/50'
      }`}
      onClick={handlePlay}
    >
      {/* Index / Play Icon */}
      <div className="flex items-center justify-center">
        <span
          className={`text-sm tabular-nums ${
            isActive ? 'text-spotify-green' : 'text-subtext'
          } group-hover:hidden`}
        >
          {index + 1}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handlePlay()
          }}
          className="hidden group-hover:flex items-center justify-center text-primary"
        >
          {isCurrentlyPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" fill="currentColor" />}
        </button>
      </div>

      {/* Title */}
      <div className="flex items-center gap-3 min-w-0">
        {track.cover_url ? (
          <img
            src={track.cover_url}
            alt={track.title}
            className="w-9 h-9 rounded object-cover shrink-0 shadow animate-in fade-in"
          />
        ) : (
          <div className="w-9 h-9 rounded bg-surface-highlight flex items-center justify-center shrink-0 shadow">
            <Music size={14} className="text-subtext/50" />
          </div>
        )}
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-spotify-green' : ''}`}>
            {track.title}
          </p>
          <p className="text-xs text-subtext truncate">
            {track.artist_name || 'Unknown Artist'}
            <span className="md:hidden">
              {track.album_title ? ` • ${track.album_title}` : ''}
              {track.duration_seconds ? ` • ${formatDuration(track.duration_seconds)}` : ''}
            </span>
          </p>
        </div>
      </div>

      {/* Album */}
      <p className="hidden md:block text-sm text-subtext truncate">{track.album_title || 'Single'}</p>

      {/* Heart / Like button */}
      <button
        onClick={handleToggleLike}
        disabled={liking || liked === null}
        title={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        className={`flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-100 ${
          liked ? 'opacity-100 text-spotify-green' : 'text-subtext hover:text-spotify-green'
        } ${liking ? 'animate-pulse' : ''}`}
      >
        <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
      </button>

      {/* Duration */}
      <span className="hidden md:block text-sm text-subtext tabular-nums text-right">
        {formatDuration(track.duration_seconds)}
      </span>

      {/* More Menu */}
      <div className="relative flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowMenu(!showMenu)
          }}
          className="p-1 rounded-full text-subtext md:opacity-0 md:group-hover:opacity-100 hover:text-primary transition-all"
        >
          <MoreHorizontal size={16} />
        </button>
        {showMenu && (
          <AddToPlaylistMenu
            trackId={track.id}
            onClose={() => setShowMenu(false)}
          />
        )}
      </div>
    </div>
  )
}

export function TrackListHeader() {
  return (
    <div className="grid grid-cols-[32px_1fr_32px_40px] md:grid-cols-[32px_1fr_1fr_32px_80px_40px] gap-2 md:gap-4 items-center px-2 md:px-4 py-2 border-b border-surface-highlight text-xs text-subtext uppercase tracking-wider">
      <span className="text-center">#</span>
      <span>Title</span>
      <span className="hidden md:block">Album</span>
      <span />
      <span className="hidden md:flex text-right items-center justify-end gap-1">
        <Clock size={14} />
      </span>
      <span />
    </div>
  )
}
