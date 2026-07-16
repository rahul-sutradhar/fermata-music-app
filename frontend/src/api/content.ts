import { apiRequest } from './client'
import type { Show, Episode, Audiobook, Chapter } from '@/types'

export function getShow(id: number) {
  return apiRequest<Show>(`/shows/${id}`)
}

export function getShowEpisodes(showId: number, skip = 0, limit = 20) {
  return apiRequest<Episode[]>(`/shows/${showId}/episodes?skip=${skip}&limit=${limit}`)
}

export function getEpisode(id: number) {
  return apiRequest<Episode>(`/episodes/${id}`)
}

export function getAudiobook(id: number) {
  return apiRequest<Audiobook>(`/audiobooks/${id}`)
}

export function getAudiobookChapters(audiobookId: number, skip = 0, limit = 20) {
  return apiRequest<Chapter[]>(`/audiobooks/${audiobookId}/chapters?skip=${skip}&limit=${limit}`)
}

export function getChapter(id: number) {
  return apiRequest<Chapter>(`/chapters/${id}`)
}
