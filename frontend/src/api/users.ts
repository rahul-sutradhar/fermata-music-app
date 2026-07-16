import { apiRequest } from './client'
import type { TopItem } from '@/types'

export function getTopItems(
  itemType: 'artists' | 'tracks',
  timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
  limit = 20,
) {
  return apiRequest<TopItem[]>(
    `/me/top/${itemType}?time_range=${timeRange}&limit=${limit}`,
  )
}
