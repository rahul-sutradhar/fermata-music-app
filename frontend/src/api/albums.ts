import { apiRequest } from './client'
import type { Album, Track } from '@/types'

export function getAlbum(id: number) {
  return apiRequest<Album & { tracks?: Track[] }>(`/albums/${id}`)
}

export function getAlbumTracks(id: number, skip = 0, limit = 20) {
  return apiRequest<Track[]>(`/albums/${id}/tracks?skip=${skip}&limit=${limit}`)
}

export function listAlbums(skip = 0, limit = 100) {
  return apiRequest<Album[]>(`/albums?skip=${skip}&limit=${limit}`)
}

export function createAlbum(data: { title: string; artist_id: number }) {
  return apiRequest<Album>('/albums', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAlbum(
  id: number,
  data: { title?: string; artist_id?: number },
) {
  return apiRequest<Album>(`/albums/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteAlbum(id: number) {
  return apiRequest<void>(`/albums/${id}`, {
    method: 'DELETE',
  })
}

export function uploadAlbumCover(id: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<Album>(`/albums/${id}/cover`, {
    method: 'POST',
    body: formData,
  })
}

