import { useRef, useEffect, useCallback, useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import {
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Music,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Download,
  Languages,
  Loader2,
} from 'lucide-react'
import { fetchTrackLyrics, transliterateTrackLyrics } from '@/api/tracks'

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function ExpandedPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isExpanded = usePlayerStore((s) => s.isExpanded)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progressMs = usePlayerStore((s) => s.progressMs)
  const durationMs = usePlayerStore((s) => s.durationMs)
  const volume = usePlayerStore((s) => s.volume)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)

  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const setProgressMs = usePlayerStore((s) => s.setProgressMs)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const setShuffle = usePlayerStore((s) => s.setShuffle)
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrevious = usePlayerStore((s) => s.playPrevious)
  const setCurrentTrack = usePlayerStore((s) => s.setTrack)

  const progressBarRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  // Lyrics-fetch states
  const [fetchingLyrics, setFetchingLyrics] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Transliteration states
  const [transliterating, setTransliterating] = useState(false)
  const [transliteration, setTransliteration] = useState<string | null>(null)
  const [showTransliteration, setShowTransliteration] = useState(false)
  const [translitError, setTranslitError] = useState<string | null>(null)

  // Reset per-track state on track change
  useEffect(() => {
    setTransliteration(null)
    setShowTransliteration(false)
    setTranslitError(null)
    setFetchError(null)
  }, [currentTrack?.id])

  const handleSeek = useCallback(
    (clientX: number) => {
      const bar = progressBarRef.current
      if (!bar || !durationMs) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const newMs = ratio * durationMs
      if ((window as any).fermataSeek) {
        (window as any).fermataSeek(newMs)
      }
      setProgressMs(newMs)
    },
    [durationMs, setProgressMs],
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

  const cycleRepeat = () => {
    const modes: Array<'off' | 'context' | 'track'> = ['off', 'context', 'track']
    const idx = modes.indexOf(repeatMode)
    setRepeatMode(modes[(idx + 1) % modes.length])
  }

  const handleFetchLyrics = async () => {
    if (!currentTrack) return
    setFetchingLyrics(true)
    setFetchError(null)
    try {
      const updated = await fetchTrackLyrics(currentTrack.id)
      if (updated.lyrics) {
        setCurrentTrack({ ...currentTrack, lyrics: updated.lyrics })
      } else {
        setFetchError('No lyrics could be found for this track.')
      }
    } catch {
      setFetchError('Failed to fetch lyrics. Please try again later.')
    } finally {
      setFetchingLyrics(false)
    }
  }

  const handleTransliterate = async () => {
    if (!currentTrack) return
    if (transliteration) {
      setShowTransliteration((prev) => !prev)
      return
    }
    setTransliterating(true)
    setTranslitError(null)
    try {
      const result = await transliterateTrackLyrics(currentTrack.id)
      setTransliteration(result.transliteration)
      setShowTransliteration(true)
    } catch {
      setTranslitError('Transliteration failed. Please try again.')
    } finally {
      setTransliterating(false)
    }
  }

  if (!isExpanded || !currentTrack) return null

  const progress = durationMs > 0 ? (progressMs / durationMs) * 100 : 0
  const hasLyrics = !!(currentTrack.lyrics && currentTrack.lyrics.trim())

  return (
    <div className="fixed inset-0 z-50 bg-[#121212] text-white flex flex-col animate-in slide-in-from-bottom duration-300 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 shrink-0 bg-black/40 backdrop-blur-md">
        <button
          onClick={() => usePlayerStore.setState({ isExpanded: false })}
          className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Minimize"
        >
          <X size={24} />
        </button>
        <span className="text-sm font-bold tracking-wider uppercase text-zinc-400">Now Playing</span>
        <div className="w-10 h-10" /> {/* Spacer */}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full p-6 flex flex-col md:flex-row gap-8 items-center md:items-stretch min-h-0">
        {/* Left Panel: Cover & Controls */}
        <div className="flex-1 flex flex-col justify-center items-center max-w-md w-full gap-8 shrink-0">
          <div className="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800/80 bg-zinc-900 flex items-center justify-center shrink-0">
            {currentTrack.cover_url ? (
              <img src={currentTrack.cover_url} alt={currentTrack.title} className="w-full h-full object-cover" />
            ) : (
              <Music size={128} className="text-zinc-700" />
            )}
          </div>

          <div className="text-center w-full min-w-0">
            <h1 className="text-2xl font-bold truncate">{currentTrack.title}</h1>
            <p className="text-zinc-400 text-sm mt-1 truncate">{currentTrack.artist_name || 'Unknown Artist'}</p>
          </div>

          {/* Player controls */}
          <div className="w-full max-w-sm flex flex-col gap-4">
            {/* Buttons Row */}
            <div className="flex items-center justify-between px-2">
              {/* Shuffle */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setShuffle(!shuffle)}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${shuffle ? 'text-spotify-green' : 'text-zinc-400 hover:text-white'}`}
                  title={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
                >
                  <Shuffle size={18} />
                </button>
                {shuffle && <span className="w-1 h-1 bg-spotify-green rounded-full -mt-0.5" />}
              </div>

              {/* Previous */}
              <button 
                onClick={() => playPrevious()} 
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
                title="Previous Track"
              >
                <SkipBack size={24} fill="currentColor" />
              </button>

              {/* Play/Pause */}
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-14 h-14 bg-white hover:bg-zinc-200 text-black rounded-full flex items-center justify-center transition-transform hover:scale-105 cursor-pointer shadow-lg shrink-0"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-1" />}
              </button>

              {/* Next */}
              <button 
                onClick={() => playNext(true)} 
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
                title="Next Track"
              >
                <SkipForward size={24} fill="currentColor" />
              </button>

              {/* Repeat */}
              <div className="flex flex-col items-center">
                <button
                  onClick={cycleRepeat}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${repeatMode !== 'off' ? 'text-spotify-green' : 'text-zinc-400 hover:text-white'}`}
                  title={`Repeat mode: ${repeatMode}`}
                >
                  {repeatMode === 'track' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                </button>
                {repeatMode !== 'off' && <span className="w-1 h-1 bg-spotify-green rounded-full -mt-0.5" />}
              </div>
            </div>

            {/* Skipbar (Progress Bar) */}
            <div className="flex items-center gap-3 w-full">
              <span className="text-[11px] text-zinc-400 w-10 text-right font-mono tabular-nums">
                {formatTime(progressMs)}
              </span>
              <div
                ref={progressBarRef}
                className="relative flex-1 py-3 cursor-pointer group"
                onMouseDown={handleMouseDown}
              >
                <div className="h-1 bg-zinc-700 rounded-full w-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full group-hover:bg-spotify-green transition-colors"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  style={{ left: `${progress}%`, marginLeft: '-6px' }}
                />
              </div>
              <span className="text-[11px] text-zinc-400 w-10 font-mono tabular-nums">
                {formatTime(durationMs)}
              </span>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-3 w-full px-2 mt-1">
              <button
                onClick={() => setVolume(volume === 0 ? 50 : 0)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Mute / Unmute"
              >
                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-spotify-green h-1 cursor-pointer bg-zinc-700 animate-in fade-in duration-200"
              />
            </div>
          </div>
        </div>

        {/* Right Panel: Lyrics */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#181818] rounded-2xl border border-zinc-800 p-6 md:p-8 shadow-inner max-h-[500px] md:max-h-none overflow-hidden">
          {/* Lyrics header with action buttons */}
          <div className="flex items-center justify-between shrink-0 mb-4">
            <h2 className="text-lg font-bold text-spotify-green flex items-center gap-2">
              <Music size={18} />
              Lyrics
              {showTransliteration && (
                <span className="text-xs font-normal text-zinc-500 ml-1">(transliterated)</span>
              )}
            </h2>

            <div className="flex items-center gap-2">
              {/* Transliterate: only when lyrics exist */}
              {hasLyrics && (
                <button
                  onClick={handleTransliterate}
                  disabled={transliterating}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all cursor-pointer select-none ${
                    showTransliteration
                      ? 'bg-spotify-green/20 border-spotify-green text-spotify-green'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={showTransliteration ? 'Show original lyrics' : 'Transliterate to English phonetics'}
                >
                  {transliterating ? <Loader2 size={13} className="animate-spin" /> : <Languages size={13} />}
                  {transliterating ? 'Transliterating…' : showTransliteration ? 'Original' : 'Transliterate'}
                </button>
              )}

              {/* Fetch Lyrics: only when no lyrics */}
              {!hasLyrics && (
                <button
                  onClick={handleFetchLyrics}
                  disabled={fetchingLyrics}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-spotify-green/20 border border-spotify-green text-spotify-green hover:bg-spotify-green/30 transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Fetch lyrics from online sources"
                >
                  {fetchingLyrics ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {fetchingLyrics ? 'Fetching…' : 'Fetch Lyrics'}
                </button>
              )}
            </div>
          </div>

          {/* Lyrics content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin text-zinc-300 font-medium text-lg leading-loose pr-2 select-text whitespace-pre-line">
            {hasLyrics ? (
              <>
                {showTransliteration && transliteration ? transliteration : currentTrack.lyrics}
                {translitError && <p className="mt-4 text-xs text-red-400">{translitError}</p>}
              </>
            ) : fetchingLyrics ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-500">
                <Loader2 size={32} className="animate-spin text-spotify-green" />
                <p className="text-sm">Searching for lyrics across sources…</p>
              </div>
            ) : fetchError ? (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-red-400">{fetchError}</p>
                <p className="text-xs text-zinc-600">This track may not have indexed lyrics yet.</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-500">
                <p className="text-sm italic">Lyrics not available for this song.</p>
                <p className="text-xs text-zinc-600">Click “Fetch Lyrics” to search online.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
