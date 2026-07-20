import { useRef, useEffect, useCallback, memo } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>
}

// Isolated progress bar — the ONLY component that re-renders on every timeupdate.
// Kept separate so the transport buttons never re-render during playback.
const ProgressBar = memo(function ProgressBar({
  audioRef,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>
}) {
  const progressMs = usePlayerStore((s) => s.progressMs)
  const durationMs = usePlayerStore((s) => s.durationMs)
  const setProgressMs = usePlayerStore((s) => s.setProgressMs)

  const progressBarRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleSeek = useCallback(
    (clientX: number) => {
      const bar = progressBarRef.current
      const audio = audioRef.current
      if (!bar || !audio || !durationMs) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const newMs = Math.round(ratio * durationMs)
      try {
        audio.currentTime = newMs / 1000
      } catch (err) {
        console.warn('Seeking not supported by media source in current state:', err)
      }
      setProgressMs(newMs)
    },
    [audioRef, durationMs, setProgressMs],
  )

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    handleSeek(e.clientX)
  }, [handleSeek])

  useEffect(() => {
    const handleMouseMoveGlobal = (e: MouseEvent) => {
      if (!isDragging.current) return
      handleSeek(e.clientX)
    }
    const handleMouseUpGlobal = () => {
      isDragging.current = false
    }
    window.addEventListener('mousemove', handleMouseMoveGlobal)
    window.addEventListener('mouseup', handleMouseUpGlobal)
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveGlobal)
      window.removeEventListener('mouseup', handleMouseUpGlobal)
    }
  }, [handleSeek])

  const progress = durationMs > 0 ? (progressMs / durationMs) * 100 : 0

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[11px] text-subtext w-10 text-right tabular-nums">
        {formatTime(progressMs)}
      </span>
      <div
        ref={progressBarRef}
        className="relative flex-1 py-3 cursor-pointer group"
        onMouseDown={handleMouseDown}
      >
        <div className="h-1 bg-surface-highlight rounded-full w-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full group-hover:bg-spotify-green transition-colors"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%`, marginLeft: '-6px' }}
        />
      </div>
      <span className="text-[11px] text-subtext w-10 tabular-nums">
        {formatTime(durationMs)}
      </span>
    </div>
  )
})

// Transport buttons — only re-render when isPlaying / shuffle / repeatMode change.
// Never re-renders from progress updates.
export default function PlayerControls({ audioRef }: Props) {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const setShuffle = usePlayerStore((s) => s.setShuffle)
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrevious = usePlayerStore((s) => s.playPrevious)

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => { })
    }
    setIsPlaying(!isPlaying)
  }, [audioRef, isPlaying, setIsPlaying])

  const cycleRepeat = useCallback(() => {
    const modes: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track']
    const idx = modes.indexOf(repeatMode)
    setRepeatMode(modes[(idx + 1) % modes.length])
  }, [repeatMode, setRepeatMode])

  return (
    <div className="flex flex-col items-center gap-1 w-full max-w-[600px]">
      {/* Transport Buttons */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setShuffle(!shuffle)}
          className={`p-1.5 rounded-full transition-colors ${shuffle ? 'text-spotify-green' : 'text-subtext hover:text-primary'
            }`}
          title="Shuffle"
        >
          <Shuffle size={16} />
        </button>

        <button
          onClick={playPrevious}
          className="p-1.5 rounded-full text-subtext hover:text-primary transition-colors"
          title="Previous"
        >
          <SkipBack size={18} />
        </button>

        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-primary text-inverted flex items-center justify-center hover:scale-105 transition-transform"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        <button
          onClick={playNext}
          className="p-1.5 rounded-full text-subtext hover:text-primary transition-colors"
          title="Next"
        >
          <SkipForward size={18} />
        </button>

        <button
          onClick={cycleRepeat}
          className={`p-1.5 rounded-full transition-colors ${repeatMode !== 'off' ? 'text-spotify-green' : 'text-subtext hover:text-primary'
            }`}
          title={`Repeat: ${repeatMode}`}
        >
          {repeatMode === 'track' ? <Repeat1 size={16} /> : <Repeat size={16} />}
        </button>
      </div>

      {/* Progress Bar — isolated re-renders only */}
      <ProgressBar audioRef={audioRef} />
    </div>
  )
}
