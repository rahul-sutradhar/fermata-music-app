import { create } from 'zustand'
import type { Track } from '@/types'
import { getAutoplayTrack } from '@/api/tracks'

interface PlayerState {
  currentTrack: Track | null
  queue: Track[]
  isPlaying: boolean
  progressMs: number
  durationMs: number
  volume: number
  shuffle: boolean
  repeatMode: 'off' | 'context' | 'track'
  isExpanded: boolean

  is3DEnabled: boolean
  is3DReverbEnabled: boolean
  orbitSpeedSeconds: number
  orbitHeightPercent: number
  is3DModalOpen: boolean

  isEQEnabled: boolean
  eqPreset: string
  eqGains: number[]
  eqPreamp: number
  isEQModalOpen: boolean

  setTrack: (track: Track) => void
  setQueue: (tracks: Track[]) => void
  setIsPlaying: (playing: boolean) => void
  setProgressMs: (ms: number) => void
  setDurationMs: (ms: number) => void
  setVolume: (vol: number) => void
  setShuffle: (shuffle: boolean) => void
  setRepeatMode: (mode: 'off' | 'context' | 'track') => void
  playNext: (manual?: boolean) => void
  playPrevious: () => void

  set3DEnabled: (enabled: boolean) => void
  set3DReverbEnabled: (enabled: boolean) => void
  setOrbitSpeedSeconds: (seconds: number) => void
  setOrbitHeightPercent: (percent: number) => void
  set3DModalOpen: (open: boolean) => void

  setEQEnabled: (enabled: boolean) => void
  setEQPreset: (preset: string) => void
  setEQGains: (gains: number[]) => void
  setEQPreamp: (preamp: number) => void
  setEQModalOpen: (open: boolean) => void
}

const getInitial3D = () => {
  try {
    const saved = localStorage.getItem('fermata_3d_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        is3DEnabled: !!parsed.is3DEnabled,
        is3DReverbEnabled: parsed.is3DReverbEnabled !== undefined ? !!parsed.is3DReverbEnabled : true,
        orbitSpeedSeconds: typeof parsed.orbitSpeedSeconds === 'number' ? parsed.orbitSpeedSeconds : 8,
        orbitHeightPercent: typeof parsed.orbitHeightPercent === 'number' ? parsed.orbitHeightPercent : 30,
      }
    }
  } catch (err) {
    console.error('Failed to parse saved 3D settings:', err)
  }
  return {
    is3DEnabled: false,
    is3DReverbEnabled: true,
    orbitSpeedSeconds: 8,
    orbitHeightPercent: 30,
  }
}

const initial3D = getInitial3D()

const getInitialEQ = () => {
  try {
    const saved = localStorage.getItem('fermata_eq_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        isEQEnabled: !!parsed.isEQEnabled,
        eqPreset: parsed.eqPreset || 'flat',
        eqGains: Array.isArray(parsed.eqGains) && parsed.eqGains.length === 10 
          ? parsed.eqGains 
          : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        eqPreamp: typeof parsed.eqPreamp === 'number' ? parsed.eqPreamp : 0,
      }
    }
  } catch (err) {
    console.error('Failed to parse saved EQ settings:', err)
  }
  return {
    isEQEnabled: false,
    eqPreset: 'flat',
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    eqPreamp: 0,
  }
}

const initialEQ = getInitialEQ()

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  isPlaying: false,
  progressMs: 0,
  durationMs: 0,
  volume: 50,
  shuffle: false,
  repeatMode: 'off',
  isExpanded: false,

  is3DEnabled: initial3D.is3DEnabled,
  is3DReverbEnabled: initial3D.is3DReverbEnabled,
  orbitSpeedSeconds: initial3D.orbitSpeedSeconds,
  orbitHeightPercent: initial3D.orbitHeightPercent,
  is3DModalOpen: false,

  isEQEnabled: initialEQ.isEQEnabled,
  eqPreset: initialEQ.eqPreset,
  eqGains: initialEQ.eqGains,
  eqPreamp: initialEQ.eqPreamp,
  isEQModalOpen: false,

  setTrack: (track) => set({ currentTrack: track, isPlaying: true, progressMs: 0, durationMs: track.duration_seconds ? track.duration_seconds * 1000 : 0 }),
  setQueue: (tracks) => set({ queue: tracks }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setProgressMs: (progressMs) => set({ progressMs }),
  setDurationMs: (durationMs) => set({ durationMs }),
  setVolume: (volume) => set({ volume }),
  setShuffle: (shuffle) => set({ shuffle }),
  setRepeatMode: (repeatMode) => set({ repeatMode }),

  set3DEnabled: (is3DEnabled) => {
    set({ is3DEnabled })
    const { is3DReverbEnabled, orbitSpeedSeconds, orbitHeightPercent } = get()
    localStorage.setItem('fermata_3d_settings', JSON.stringify({ is3DEnabled, is3DReverbEnabled, orbitSpeedSeconds, orbitHeightPercent }))
  },
  set3DReverbEnabled: (is3DReverbEnabled) => {
    set({ is3DReverbEnabled })
    const { is3DEnabled, orbitSpeedSeconds, orbitHeightPercent } = get()
    localStorage.setItem('fermata_3d_settings', JSON.stringify({ is3DEnabled, is3DReverbEnabled, orbitSpeedSeconds, orbitHeightPercent }))
  },
  setOrbitSpeedSeconds: (orbitSpeedSeconds) => {
    set({ orbitSpeedSeconds })
    const { is3DEnabled, is3DReverbEnabled, orbitHeightPercent } = get()
    localStorage.setItem('fermata_3d_settings', JSON.stringify({ is3DEnabled, is3DReverbEnabled, orbitSpeedSeconds, orbitHeightPercent }))
  },
  setOrbitHeightPercent: (orbitHeightPercent) => {
    set({ orbitHeightPercent })
    const { is3DEnabled, is3DReverbEnabled, orbitSpeedSeconds } = get()
    localStorage.setItem('fermata_3d_settings', JSON.stringify({ is3DEnabled, is3DReverbEnabled, orbitSpeedSeconds, orbitHeightPercent }))
  },
  set3DModalOpen: (is3DModalOpen) => set({ is3DModalOpen }),

  setEQEnabled: (isEQEnabled) => {
    set({ isEQEnabled })
    const { eqPreset, eqGains, eqPreamp } = get()
    localStorage.setItem('fermata_eq_settings', JSON.stringify({ isEQEnabled, eqPreset, eqGains, eqPreamp }))
  },
  setEQPreset: (eqPreset) => {
    set({ eqPreset })
    const { isEQEnabled, eqGains, eqPreamp } = get()
    localStorage.setItem('fermata_eq_settings', JSON.stringify({ isEQEnabled, eqPreset, eqGains, eqPreamp }))
  },
  setEQGains: (eqGains) => {
    set({ eqGains })
    const { isEQEnabled, eqPreset, eqPreamp } = get()
    localStorage.setItem('fermata_eq_settings', JSON.stringify({ isEQEnabled, eqPreset, eqGains, eqPreamp }))
  },
  setEQPreamp: (eqPreamp) => {
    set({ eqPreamp })
    const { isEQEnabled, eqPreset, eqGains } = get()
    localStorage.setItem('fermata_eq_settings', JSON.stringify({ isEQEnabled, eqPreset, eqGains, eqPreamp }))
  },
  setEQModalOpen: (isEQModalOpen) => set({ isEQModalOpen }),

  playNext: async (manual = false) => {
    const { currentTrack, queue, shuffle, repeatMode } = get()
    if (!currentTrack) return

    // If auto-ended and repeatMode is 'track', repeat current track
    if (!manual && repeatMode === 'track') {
      set({ progressMs: 0, isPlaying: true })
      return
    }

    const effectiveQueue = queue.length > 0 ? queue : [currentTrack]
    const currentIndex = effectiveQueue.findIndex((t) => t.id === currentTrack.id)

    if (shuffle && effectiveQueue.length > 1) {
      let nextIndex = Math.floor(Math.random() * effectiveQueue.length)
      if (nextIndex === currentIndex) {
        nextIndex = (currentIndex + 1) % effectiveQueue.length
      }
      const nextTrack = effectiveQueue[nextIndex]
      set({ currentTrack: nextTrack, progressMs: 0, isPlaying: true })
      return
    }

    const nextIndex = currentIndex + 1
    if (nextIndex < effectiveQueue.length && nextIndex >= 0) {
      const nextTrack = effectiveQueue[nextIndex]
      set({ currentTrack: nextTrack, progressMs: 0, isPlaying: true })
    } else {
      if (repeatMode === 'context') {
        const nextTrack = effectiveQueue[0]
        set({ currentTrack: nextTrack, progressMs: 0, isPlaying: true })
      } else {
        // Reached end of queue with repeat off: Trigger Autoplay!
        try {
          let sessionId = sessionStorage.getItem('fermata_session_id')
          if (!sessionId) {
            sessionId = Math.random().toString(36).substring(2, 15)
            sessionStorage.setItem('fermata_session_id', sessionId)
          }
          const nextTrack = await getAutoplayTrack(currentTrack.id, sessionId)
          if (nextTrack) {
            set({
              queue: [...effectiveQueue, nextTrack],
              currentTrack: nextTrack,
              progressMs: 0,
              isPlaying: true,
            })
          } else {
            set({ isPlaying: false, progressMs: 0 })
          }
        } catch (err) {
          console.error('[Autoplay] Failed to fetch next track:', err)
          set({ isPlaying: false, progressMs: 0 })
        }
      }
    }
  },

  playPrevious: () => {
    const { currentTrack, queue, progressMs, shuffle, repeatMode } = get()
    if (!currentTrack) return

    // Spotify Rule: If song has played for more than 3 seconds, restart current track at 0:00
    if (progressMs > 3000) {
      set({ progressMs: 0, isPlaying: true })
      return
    }

    const effectiveQueue = queue.length > 0 ? queue : [currentTrack]
    const currentIndex = effectiveQueue.findIndex((t) => t.id === currentTrack.id)

    if (shuffle && effectiveQueue.length > 1) {
      let prevIndex = Math.floor(Math.random() * effectiveQueue.length)
      if (prevIndex === currentIndex) {
        prevIndex = (currentIndex - 1 + effectiveQueue.length) % effectiveQueue.length
      }
      const prevTrack = effectiveQueue[prevIndex]
      set({ currentTrack: prevTrack, progressMs: 0, isPlaying: true })
      return
    }

    if (currentIndex > 0) {
      const prevTrack = effectiveQueue[currentIndex - 1]
      set({ currentTrack: prevTrack, progressMs: 0, isPlaying: true })
    } else if (repeatMode === 'context') {
      const prevTrack = effectiveQueue[effectiveQueue.length - 1]
      set({ currentTrack: prevTrack, progressMs: 0, isPlaying: true })
    } else {
      set({ progressMs: 0, isPlaying: true })
    }
  },
}))

