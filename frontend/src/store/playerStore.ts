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

  setTrack: (track: Track) => void
  setQueue: (tracks: Track[]) => void
  setIsPlaying: (playing: boolean) => void
  setProgressMs: (ms: number) => void
  setDurationMs: (ms: number) => void
  setVolume: (vol: number) => void
  setShuffle: (shuffle: boolean) => void
  setRepeatMode: (mode: 'off' | 'context' | 'track') => void
  playNext: () => void
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

  setTrack: (track) => set({ currentTrack: track, progressMs: 0 }),
  setQueue: (tracks) => set({ queue: tracks }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setProgressMs: (progressMs) => set({ progressMs }),
  setDurationMs: (durationMs) => set({ durationMs }),
  setVolume: (volume) => set({ volume }),
  setShuffle: (shuffle) => set({ shuffle }),
  setRepeatMode: (repeatMode) => set({ repeatMode }),

  playNext: () => {
    const { currentTrack, queue, shuffle, repeatMode } = get()
    if (!queue.length) return
    const currentIndex = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1
    let nextIndex: number

    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length)
    } else {
      nextIndex = currentIndex + 1
      if (nextIndex >= queue.length) {
        if (repeatMode === 'context') {
          nextIndex = 0
        } else {
          set({ isPlaying: false, progressMs: 0 })
          return
        }
      }
    }
    const nextTrack = queue[nextIndex]
    if (nextTrack) {
      set({ currentTrack: nextTrack, progressMs: 0, isPlaying: true })
    }
  },

  playPrevious: () => {
    const { currentTrack, queue } = get()
    if (!queue.length || !currentTrack) return
    const currentIndex = queue.findIndex((t) => t.id === currentTrack.id)
    if (currentIndex > 0) {
      const prevTrack = queue[currentIndex - 1]
      set({ currentTrack: prevTrack, progressMs: 0, isPlaying: true })
    }
  },
}))
