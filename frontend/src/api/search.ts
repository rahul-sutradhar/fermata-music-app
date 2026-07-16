import { apiRequest } from './client'
import type { SearchResponse } from '@/types'

export function search(q: string, limit = 10) {
  return apiRequest<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`)
}
