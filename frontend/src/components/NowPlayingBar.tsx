import { useRef, useEffect, useCallback, useState } from 'react'
import { Volume2, VolumeX, Music } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { getTrackAudioUrl, getTrack } from '@/api/tracks'
import { addRecentlyPlayed, getPlayerState, updatePlayerState } from '@/api/player'
import { useAuthStore } from '@/store/authStore'
import PlayerControls from './PlayerControls'

export default function NowPlayingBar() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const shouldRestoreProgress = useRef(false)
  const isInitialRestoring = useRef(true)
  const [showMobileVolume, setShowMobileVolume] = useState(false)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const progressMs = usePlayerStore((s) => s.progressMs)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)

  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const setProgressMs = usePlayerStore((s) => s.setProgressMs)
  const setDurationMs = usePlayerStore((s) => s.setDurationMs)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const playNext = usePlayerStore((s) => s.playNext)
  const token = useAuthStore((s) => s.token)

  // Load player state on page mount / login
  useEffect(() => {
    if (!token) return

    async function restorePlayerState() {
      try {
        const state = await getPlayerState()
        if (state) {
          if (state.track_id) {
            try {
              const track = await getTrack(state.track_id)
              if (track) {
                shouldRestoreProgress.current = true
                usePlayerStore.setState({
                  currentTrack: track,
                  isPlaying: false,
                  progressMs: state.progress_ms,
                  durationMs: track.duration_seconds ? track.duration_seconds * 1000 : 0,
                  volume: state.volume,
                  shuffle: state.shuffle,
                  repeatMode: state.repeat_mode as 'off' | 'context' | 'track',
                })
              }
            } catch (err) {
              console.error('Failed to load saved track details:', err)
            }
          } else {
            usePlayerStore.setState({
              volume: state.volume,
              shuffle: state.shuffle,
              repeatMode: state.repeat_mode as 'off' | 'context' | 'track',
            })
          }
        }
      } catch (err) {
        console.error('Failed to load initial player state:', err)
      } finally {
        setTimeout(() => {
          isInitialRestoring.current = false
        }, 1200)
      }
    }

    restorePlayerState()
  }, [token])

  // Sync settings/playback changes back to the database (debounced by 1s)
  useEffect(() => {
    if (!token || !currentTrack || isInitialRestoring.current) return

    const timer = setTimeout(() => {
      updatePlayerState({
        track_id: currentTrack.id,
        is_playing: isPlaying,
        progress_ms: usePlayerStore.getState().progressMs,
        volume: volume,
        shuffle: shuffle,
        repeat_mode: repeatMode,
      }).catch(() => { })
    }, 1000)

    return () => clearTimeout(timer)
  }, [token, currentTrack, isPlaying, volume, shuffle, repeatMode])

  // Periodic progress sync back to the database (every 5 seconds while playing)
  useEffect(() => {
    if (!token || !currentTrack || !isPlaying) return

    const interval = setInterval(() => {
      updatePlayerState({
        track_id: currentTrack.id,
        is_playing: isPlaying,
        progress_ms: usePlayerStore.getState().progressMs,
        volume: usePlayerStore.getState().volume,
        shuffle: usePlayerStore.getState().shuffle,
        repeat_mode: usePlayerStore.getState().repeatMode,
      }).catch(() => { })
    }, 5000)

    return () => clearInterval(interval)
  }, [token, currentTrack, isPlaying])

  // Load audio source when track changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    let cancelled = false

    // Immediately stop and unload the previous track to prevent it from continuing to play while fetching the new URL
    audio.pause()
    audio.removeAttribute('src')
    audio.load()

    async function loadAudio() {
      let url = ''
      try {
        const res = await getTrackAudioUrl(currentTrack!.id)
        if (res && res.audio_url) {
          url = res.audio_url
        }
      } catch (err) {
        console.error('Failed to get track audio URL:', err)
      }

      if (!url || cancelled) return

      try {
        audio!.src = url
        audio!.load()
        // Explicitly apply volume to prevent browser volume resets on new track loads
        audio!.volume = Math.pow(usePlayerStore.getState().volume / 100, 2)
        
        const shouldPlay = usePlayerStore.getState().isPlaying
        if (shouldPlay) {
          audio!.play().catch((err) => {
            console.warn('Auto-play blocked, click the page to enable playback:', err)
          })
          setIsPlaying(true)
        } else {
          setIsPlaying(false)
        }

        // Record recently played
        if (token && shouldPlay) {
          addRecentlyPlayed(currentTrack!.id).catch(() => { })
        }
      } catch (err) {
        console.error('Audio load error:', err)
      }
    }

    loadAudio()
    return () => {
      cancelled = true
    }
  }, [currentTrack, setIsPlaying, token])

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      // Use exponential curve for natural logarithmic volume perception
      audioRef.current.volume = Math.pow(volume / 100, 2)
    }
  }, [volume])

  // Sync playback play/pause state with store changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return

    if (isPlaying) {
      audio.play().catch((err) => {
        console.warn('Playback fail or auto-play blocked:', err)
      })
    } else {
      audio.pause()
    }
  }, [isPlaying])

  // Progress updates
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      setProgressMs(Math.round(audio.currentTime * 1000))
      if (audio.duration && !isNaN(audio.duration)) {
        setDurationMs(Math.round(audio.duration * 1000))
      }
    }
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDurationMs(audio.duration * 1000)
      }
      if (shouldRestoreProgress.current) {
        const savedProgressMs = usePlayerStore.getState().progressMs
        if (savedProgressMs > 0) {
          try {
            audio.currentTime = savedProgressMs / 1000
          } catch (err) {
            console.warn('Failed to restore playback position:', err)
          }
        }
        shouldRestoreProgress.current = false
      }
    }
    const onEnded = () => {
      playNext()
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
    }
  }, [currentTrack, setProgressMs, setDurationMs, playNext])

  const toggleMute = useCallback(() => {
    setVolume(volume === 0 ? 50 : 0)
  }, [volume, setVolume])

  if (!currentTrack) {
    return (
      <div className="h-20 bg-surface-elevated border-t border-surface-highlight flex items-center justify-center">
        <p className="text-subtext text-sm">No track selected</p>
      </div>
    )
  }

  return (
    <div className="h-20 bg-surface-elevated border-t border-surface-highlight flex items-center px-3 md:px-4 gap-2 md:gap-4 shrink-0">
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" />

      {/* Track Info — Left */}
      <div className="flex items-center gap-2 md:gap-3 w-auto md:w-[240px] min-w-0 flex-1 md:flex-initial">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
          <Music size={18} className="text-subtext" />
        </div>
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-medium truncate">{currentTrack.title}</p>
          <p className="text-[10px] md:text-xs text-subtext truncate">
            {currentTrack.artist_name || 'Unknown Artist'}
          </p>
        </div>
      </div>

      {/* Controls — Center */}
      <div className="flex-initial md:flex-1 flex justify-center">
        <PlayerControls audioRef={audioRef} />
      </div>

      {/* Volume — Right */}
      <div className="flex items-center gap-2 md:w-[160px] justify-end relative">
        <button
          onClick={() => {
            if (window.innerWidth < 768) {
              setShowMobileVolume(!showMobileVolume)
            } else {
              toggleMute()
            }
          }}
          className="p-1 text-subtext hover:text-primary transition-colors cursor-pointer"
          title="Volume Control"
        >
          {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="hidden md:block w-24 accent-spotify-green h-1 cursor-pointer"
        />

        {/* Mobile floating volume slider popup */}
        {showMobileVolume && (
          <div className="absolute bottom-14 right-0 bg-surface-elevated border border-surface-highlight p-3 rounded-lg shadow-2xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              onClick={toggleMute}
              className="text-subtext hover:text-primary transition-colors cursor-pointer"
            >
              {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20 accent-spotify-green h-1 cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  )
}
