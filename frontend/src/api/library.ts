import { apiRequest } from './client'
import type { LibraryItem } from '@/types'

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
