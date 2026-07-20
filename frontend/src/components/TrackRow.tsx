import { Play, Pause, MoreHorizontal, Clock } from 'lucide-react'
import { useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import type { Track } from '@/types'
import AddToPlaylistMenu from './AddToPlaylistMenu'

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

  const isActive = currentTrack?.id === track.id
  const isCurrentlyPlaying = isActive && isPlaying

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
      className={`group grid grid-cols-[32px_1fr_40px] md:grid-cols-[32px_1fr_1fr_80px_40px] gap-2 md:gap-4 items-center px-2 md:px-4 py-2 rounded-md transition-colors cursor-pointer ${
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
      <div className="min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-spotify-green' : ''}`}>
          {track.title}
        </p>
        <p className="text-xs text-subtext truncate">
          {track.artist_name || 'Unknown Artist'}
        </p>
      </div>

      {/* Album */}
      <p className="hidden md:block text-sm text-subtext truncate">{track.album_title || '—'}</p>

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
          className="p-1 rounded-full text-subtext opacity-0 group-hover:opacity-100 hover:text-primary transition-all"
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
    <div className="grid grid-cols-[32px_1fr_40px] md:grid-cols-[32px_1fr_1fr_80px_40px] gap-2 md:gap-4 items-center px-2 md:px-4 py-2 border-b border-surface-highlight text-xs text-subtext uppercase tracking-wider">
      <span className="text-center">#</span>
      <span>Title</span>
      <span className="hidden md:block">Album</span>
      <span className="hidden md:flex text-right items-center justify-end gap-1">
        <Clock size={14} />
      </span>
      <span />
    </div>
  )
}
