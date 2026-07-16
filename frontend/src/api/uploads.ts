import { apiRequest } from './client'

interface PresignResponse {
  url: string
  key: string
}

export function presignUpload(key: string, contentType?: string, expiresIn = 300) {
  return apiRequest<PresignResponse>('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ key, content_type: contentType, expires_in: expiresIn }),
  })
}

export function confirmTrackUpload(trackId: number, key: string) {
  return apiRequest<any>('/uploads/confirm-track', {
    method: 'POST',
    body: JSON.stringify({ track_id: trackId, key }),
  })
}
