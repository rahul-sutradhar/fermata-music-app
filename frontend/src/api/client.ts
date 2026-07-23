import { useAuthStore } from '@/store/authStore'

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_HOSTED_BASE ||
  'http://localhost:8000'


export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function getToken(): string | null {
  try {
    const stored = localStorage.getItem('fermata-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.state?.token || null
    }
  } catch {
    return null
  }
  return null
}

function getRefreshToken(): string | null {
  try {
    const stored = localStorage.getItem('fermata-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.state?.refreshToken || null
    }
  } catch {
    return null
  }
  return null
}

let refreshPromise: Promise<string | null> | null = null

function doTokenRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const rToken = getRefreshToken()
    if (!rToken) return null

    try {
      const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rToken }),
      })
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        const newAccessToken = refreshData.access_token
        if (newAccessToken) {
          useAuthStore.getState().setAuth(newAccessToken, rToken)
          return newAccessToken
        }
      }
    } catch (err) {
      console.error('Failed to auto-refresh token:', err)
    }

    useAuthStore.getState().logout()
    window.location.hash = '/login'
    return null
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const isFormData = options.body instanceof FormData
  if (!isFormData && !headers['Content-Type'] && options.method !== 'GET' && options.method !== 'DELETE') {
    headers['Content-Type'] = 'application/json'
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  // Automatic JWT access token refresh interceptor
  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    const newAccessToken = await doTokenRefresh()
    if (newAccessToken) {
      headers['Authorization'] = `Bearer ${newAccessToken}`
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      })
    }
  }

  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json()

  if (!response.ok) {
    let errorMsg = data.message || `Request failed with status ${response.status}`
    if (data.detail) {
      if (Array.isArray(data.detail)) {
        errorMsg = data.detail.map((err: any) => {
          const field = err.loc ? err.loc.slice(1).join('.') : ''
          return `${field ? field + ': ' : ''}${err.msg}`
        }).join(', ')
      } else if (typeof data.detail === 'string') {
        errorMsg = data.detail
      }
    }
    throw new ApiError(response.status, errorMsg)
  }

  return data as T
}
