import { apiRequest } from './client'
import type { Track } from '@/types'

export interface SplitResult {
  is_split: boolean
  backing_file_key?: string
  split_vocals_key: string
  split_vocals_url: string
  split_drums_key: string
  split_drums_url: string
  split_bass_key: string
  split_bass_url: string
  split_other_key: string
  split_other_url: string
  split_guitar_key: string
  split_guitar_url: string
  split_piano_key: string
  split_piano_url: string
}

export interface Draft {
  id: number
  title: string
  backing_track_id: number | null
  backing_file_key: string | null
  is_split: boolean
  mix_volumes: Record<string, number>
  vocal_url: string | null
  split_vocals_url: string | null
  split_drums_url: string | null
  split_bass_url: string | null
  split_other_url: string | null
  split_guitar_url: string | null
  split_piano_url: string | null
  created_at: string
  updated_at: string
}

export function splitAppTrack(trackId: number) {
  return apiRequest<SplitResult>(`/studio/split-app-track/${trackId}`, {
    method: 'POST',
  })
}

export function splitExternalTrack(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<SplitResult>('/studio/split-external-track', {
    method: 'POST',
    body: formData,
  })
}

export interface SaveDraftPayload {
  title: string
  file: File
  backingTrackId?: number | null
  backingFileKey?: string | null
  mixVolumes?: Record<string, number> | null
  isSplit?: boolean
  splitVocalsKey?: string | null
  splitDrumsKey?: string | null
  splitBassKey?: string | null
  splitOtherKey?: string | null
  splitGuitarKey?: string | null
  splitPianoKey?: string | null
}

export function saveDraft(payload: SaveDraftPayload) {
  const formData = new FormData()
  formData.append('title', payload.title)
  formData.append('file', payload.file)
  
  if (payload.backingTrackId !== undefined && payload.backingTrackId !== null) {
    formData.append('backing_track_id', String(payload.backingTrackId))
  }
  if (payload.backingFileKey) {
    formData.append('backing_file_key', payload.backingFileKey)
  }
  
  const volumes = payload.mixVolumes || { vocal: 1.0, music: 1.0, bass: 1.0, drums: 1.0, guitar: 1.0, piano: 1.0 }
  formData.append('mix_volumes', JSON.stringify(volumes))
  formData.append('is_split', String(!!payload.isSplit))
  
  if (payload.splitVocalsKey) formData.append('split_vocals_key', payload.splitVocalsKey)
  if (payload.splitDrumsKey) formData.append('split_drums_key', payload.splitDrumsKey)
  if (payload.splitBassKey) formData.append('split_bass_key', payload.splitBassKey)
  if (payload.splitOtherKey) formData.append('split_other_key', payload.splitOtherKey)
  if (payload.splitGuitarKey) formData.append('split_guitar_key', payload.splitGuitarKey)
  if (payload.splitPianoKey) formData.append('split_piano_key', payload.splitPianoKey)

  return apiRequest<Draft>('/studio/drafts', {
    method: 'POST',
    body: formData,
  })
}

export function listDrafts() {
  return apiRequest<Draft[]>('/studio/drafts')
}

export function updateDraft(
  draftId: number,
  data: Partial<{
    title: string
    backing_track_id: number | null
    backing_file_key: string | null
    is_split: boolean
    split_vocals_key: string | null
    split_drums_key: string | null
    split_bass_key: string | null
    split_other_key: string | null
    split_guitar_key: string | null
    split_piano_key: string | null
    mix_volumes: Record<string, number>
  }>,
  file?: File | null
) {
  const formData = new FormData()
  if (data.title !== undefined) formData.append('title', data.title)
  if (data.backing_track_id !== undefined) {
    formData.append('backing_track_id', data.backing_track_id === null ? 'null' : String(data.backing_track_id))
  }
  if (data.backing_file_key !== undefined) {
    formData.append('backing_file_key', data.backing_file_key === null ? 'null' : data.backing_file_key)
  }
  if (data.is_split !== undefined) formData.append('is_split', String(data.is_split))
  if (data.split_vocals_key !== undefined) formData.append('split_vocals_key', data.split_vocals_key || '')
  if (data.split_drums_key !== undefined) formData.append('split_drums_key', data.split_drums_key || '')
  if (data.split_bass_key !== undefined) formData.append('split_bass_key', data.split_bass_key || '')
  if (data.split_other_key !== undefined) formData.append('split_other_key', data.split_other_key || '')
  if (data.split_guitar_key !== undefined) formData.append('split_guitar_key', data.split_guitar_key || '')
  if (data.split_piano_key !== undefined) formData.append('split_piano_key', data.split_piano_key || '')
  if (data.mix_volumes !== undefined) formData.append('mix_volumes', JSON.stringify(data.mix_volumes))
  if (file) formData.append('file', file)

  return apiRequest<Draft>(`/studio/drafts/${draftId}`, {
    method: 'PUT',
    body: formData,
  })
}

export function deleteDraft(draftId: number) {
  return apiRequest<void>(`/studio/drafts/${draftId}`, {
    method: 'DELETE',
  })
}

export function publishDraft(
  draftId: number,
  data: {
    title: string
    albumId?: number | null
    lyrics?: string | null
    coverImage?: File | null
  }
) {
  const formData = new FormData()
  formData.append('title', data.title)
  if (data.albumId !== undefined && data.albumId !== null) {
    formData.append('album_id', String(data.albumId))
  }
  if (data.lyrics) {
    formData.append('lyrics', data.lyrics)
  }
  if (data.coverImage) {
    formData.append('cover_image', data.coverImage)
  }

  return apiRequest<any>(`/studio/drafts/${draftId}/publish`, {
    method: 'POST',
    body: formData,
  })
}

export function listBackups() {
  return apiRequest<number[]>('/studio/backups')
}
