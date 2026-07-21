import { apiRequest } from './client'
import type { Playlist, PlaylistItem, CoverUploadResponse } from '@/types'

export function getMyPlaylists() {
  return apiRequest<Playlist[]>('/me/playlists')
}

export function createPlaylist(name: string) {
  return apiRequest<Playlist>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function getPlaylistItems(id: number) {
  return apiRequest<PlaylistItem[]>(`/playlists/${id}/items`)
}

export function addPlaylistItem(playlistId: number, trackId: number, position?: number) {
  return apiRequest<PlaylistItem>(`/playlists/${playlistId}/items`, {
    method: 'POST',
    body: JSON.stringify({ track_id: trackId, position }),
  })
}

export function deletePlaylistItem(playlistId: number, trackId: number) {
  return apiRequest<void>(`/playlists/${playlistId}/items/${trackId}`, {
    method: 'DELETE',
  })
}

export function updatePlaylistItem(playlistId: number, trackId: number, position: number) {
  return apiRequest<PlaylistItem>(`/playlists/${playlistId}/items/${trackId}`, {
    method: 'PATCH',
    body: JSON.stringify({ position }),
  })
}

export function uploadPlaylistCover(playlistId: number, file: File) {
  const formData = new FormData()
  formData.append('cover_file', file)
  return apiRequest<CoverUploadResponse>(`/playlists/${playlistId}/cover`, {
    method: 'POST',
    body: formData,
  })
}

export function deletePlaylist(playlistId: number) {
  return apiRequest<void>(`/playlists/${playlistId}`, {
    method: 'DELETE',
  })
}

