import { apiRequest } from './client'
import type { Artist, Album } from '@/types'

export function getArtist(id: number) {
  return apiRequest<Artist>(`/artists/${id}`)
}

export function getArtistAlbums(id: number, skip = 0, limit = 20) {
  return apiRequest<Album[]>(`/artists/${id}/albums?skip=${skip}&limit=${limit}`)
}

export function listArtists(skip = 0, limit = 100) {
  return apiRequest<Artist[]>(`/artists?skip=${skip}&limit=${limit}`)
}

export function createArtist(data: { name: string; user_id?: number | null }) {
  return apiRequest<Artist>('/artists', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateArtist(
  id: number,
  data: { name?: string; user_id?: number | null },
) {
  return apiRequest<Artist>(`/artists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteArtist(id: number) {
  return apiRequest<void>(`/artists/${id}`, {
    method: 'DELETE',
  })
}
