import { apiRequest } from './client'
import type { PlayerState, RecentlyPlayed } from '@/types'

export function getPlayerState() {
  return apiRequest<PlayerState>('/me/player')
}

export function updatePlayerState(state: Partial<PlayerState>) {
  return apiRequest<PlayerState>('/me/player', {
    method: 'PATCH',
    body: JSON.stringify(state),
  })
}

export function addRecentlyPlayed(trackId: number) {
  return apiRequest<void>(`/me/player/recently-played?track_id=${trackId}`, {
    method: 'POST',
  })
}

export function getRecentlyPlayed(skip = 0, limit = 20) {
  return apiRequest<RecentlyPlayed[]>(
    `/me/player/recently-played?skip=${skip}&limit=${limit}`,
  )
}

import type { Track, Album } from '@/types'

export function getMostPlayedTracks(limit = 10) {
  return apiRequest<Track[]>(`/me/player/most-played-tracks?limit=${limit}`)
}

export function getRecentlyPlayedAlbums(limit = 10) {
  return apiRequest<Album[]>(`/me/player/recently-played-albums?limit=${limit}`)
}

export function getMostPlayedAlbums(limit = 10) {
  return apiRequest<Album[]>(`/me/player/most-played-albums?limit=${limit}`)
}
