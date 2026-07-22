import { apiRequest } from './client'

export interface CandidateSong {
  id: string
  title: string
  artist: string
  album: string
  duration_seconds: number
  source_url: string
  cover_url: string
}

export interface AgenticSearchResponse {
  thread_id: string
  status: 'selection_required' | 'not_found'
  candidates: CandidateSong[]
  logs: string[]
}

export interface AgenticSelectResponse {
  status: 'reported' | 'pending_admin_approval'
  logs: string[]
}

export interface AgenticAdminReviewResponse {
  status: 'completed' | 'rejected'
  track_id?: number
  audio_url?: string
  cover_url?: string
  logs: string[]
}

export async function searchSongCandidates(songName: string): Promise<AgenticSearchResponse> {
  return apiRequest<AgenticSearchResponse>('/api/v1/agentic-ingest/search', {
    method: 'POST',
    body: JSON.stringify({ song_name: songName }),
  })
}

export async function submitCandidateSelection(
  threadId: string,
  selectedSongId: string,
): Promise<AgenticSelectResponse> {
  return apiRequest<AgenticSelectResponse>('/api/v1/agentic-ingest/select', {
    method: 'POST',
    body: JSON.stringify({ thread_id: threadId, selected_song_id: selectedSongId }),
  })
}

export async function simulateAdminApproval(
  threadId: string,
  approved: boolean,
  notes: string = '',
): Promise<AgenticAdminReviewResponse> {
  return apiRequest<AgenticAdminReviewResponse>('/api/v1/agentic-ingest/admin-review', {
    method: 'POST',
    body: JSON.stringify({ thread_id: threadId, approved, notes }),
  })
}

export interface IngestionRequestItem {
  id: number
  thread_id: string
  song_name: string
  artist_name: string
  requested_by: string
  created_at: string | null
  source_url: string
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'failed'
}

export async function listIngestionRequests(): Promise<IngestionRequestItem[]> {
  return apiRequest<IngestionRequestItem[]>('/api/v1/agentic-ingest/requests', {
    method: 'GET',
  })
}

export async function approveIngestionRequest(requestId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/v1/agentic-ingest/requests/${requestId}/approve`, {
    method: 'POST',
  })
}

export async function rejectIngestionRequest(requestId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/v1/agentic-ingest/requests/${requestId}/reject`, {
    method: 'POST',
  })
}
