import { create } from 'zustand'
import type { Track } from '@/types'

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
}

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

  setTrack: (track) => set({ currentTrack: track, progressMs: 0, durationMs: track.duration_seconds ? track.duration_seconds * 1000 : 0 }),
  setQueue: (tracks) => set({ queue: tracks }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setProgressMs: (progressMs) => set({ progressMs }),
  setDurationMs: (durationMs) => set({ durationMs }),
  setVolume: (volume) => set({ volume }),
  setShuffle: (shuffle) => set({ shuffle }),
  setRepeatMode: (repeatMode) => set({ repeatMode }),

  playNext: (manual = false) => {
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
        // Reached end of queue with repeat off
        set({ isPlaying: false, progressMs: 0 })
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

