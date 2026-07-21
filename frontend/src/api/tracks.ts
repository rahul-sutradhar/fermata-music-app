import { apiRequest } from './client'
import type { Track } from '@/types'

export function listTracks(skip = 0, limit = 20, q?: string, artistId?: number) {
  const query = new URLSearchParams({ skip: String(skip), limit: String(limit) })
  if (q) query.set('q', q)
  if (artistId) query.set('artist_id', String(artistId))
  return apiRequest<Track[]>(`/tracks?${query.toString()}`)
}

export function getTrack(id: number) {
  return apiRequest<Track>(`/tracks/${id}`)
}

export function getTrackAudioUrl(id: number) {
  return apiRequest<{ audio_url: string | null }>(`/tracks/${id}/audio`)
}

export function createTrack(
  title: string,
  albumId?: number | null,
  durationSeconds?: number,
  artistId?: number | null
) {
  const payload: Record<string, any> = {
    title,
    duration_seconds: durationSeconds ?? null,
  }
  if (albumId) payload.album_id = albumId
  if (artistId) payload.artist_id = artistId

  return apiRequest<Track>('/tracks', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateTrack(
  id: number,
  data: { title?: string; album_id?: number | null; artist_id?: number | null; duration_seconds?: number },
) {
  return apiRequest<Track>(`/tracks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}


export function deleteTrack(id: number) {
  return apiRequest<void>(`/tracks/${id}`, {
    method: 'DELETE',
  })
}

export function uploadTrackAudio(trackId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<Track>(`/tracks/${trackId}/audio`, {
    method: 'POST',
    body: formData,
  })
}

export function uploadTrackCover(trackId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<Track>(`/tracks/${trackId}/cover`, {
    method: 'POST',
    body: formData,
  })
}

