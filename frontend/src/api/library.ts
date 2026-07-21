import { apiRequest } from './client'
import type { LibraryItem, LikedAlbum } from '@/types'

// ── Liked Tracks ─────────────────────────────────────────────────────────────

export function getLibrary(skip = 0, limit = 20) {
  return apiRequest<LibraryItem[]>(`/me/library?skip=${skip}&limit=${limit}`)
}

export function addToLibrary(trackIds: number[]) {
  const q = trackIds.map((id) => `track_ids=${id}`).join('&')
  return apiRequest<void>(`/me/library?${q}`, { method: 'PUT' })
}

export function removeFromLibrary(trackIds: number[]) {
  const q = trackIds.map((id) => `track_ids=${id}`).join('&')
  return apiRequest<void>(`/me/library?${q}`, { method: 'DELETE' })
}

export function checkLibrary(trackIds: number[]) {
  const q = trackIds.map((id) => `track_ids=${id}`).join('&')
  return apiRequest<Record<number, boolean>>(`/me/library/contains?${q}`)
}

// ── Liked Albums ──────────────────────────────────────────────────────────────

export function getLikedAlbums(skip = 0, limit = 50) {
  return apiRequest<LikedAlbum[]>(`/me/library/albums?skip=${skip}&limit=${limit}`)
}

export function likeAlbum(albumId: number) {
  return apiRequest<void>(`/me/library/albums?album_ids=${albumId}`, { method: 'PUT' })
}

export function unlikeAlbum(albumId: number) {
  return apiRequest<void>(`/me/library/albums?album_ids=${albumId}`, { method: 'DELETE' })
}

export function checkAlbumsInLibrary(albumIds: number[]) {
  const q = albumIds.map((id) => `album_ids=${id}`).join('&')
  return apiRequest<Record<number, boolean>>(`/me/library/albums/contains?${q}`)
}
