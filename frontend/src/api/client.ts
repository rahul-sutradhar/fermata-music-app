let API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001'
const HOSTED_API_BASE = import.meta.env.VITE_API_HOSTED_BASE || ''


let checkPromise: Promise<void> | null = null

function ensureApiBase(): Promise<void> {
  if (checkPromise) return checkPromise

  if ((API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1')) && HOSTED_API_BASE) {
    checkPromise = (async () => {
      try {
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), 1200)

        const response = await fetch(`${API_BASE}/health`, {
          method: 'GET',
          signal: controller.signal
        })
        clearTimeout(id)

        if (!response.ok) {
          throw new Error()
        }
      } catch {
        console.warn(`Local backend (${API_BASE}) is not active. Falling back to hosted server: ${HOSTED_API_BASE}`)
        API_BASE = HOSTED_API_BASE
      }
    })()
  } else {
    checkPromise = Promise.resolve()
  }
  return checkPromise
}

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

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  await ensureApiBase()
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

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.detail || data.message || `Request failed with status ${response.status}`,
    )
  }

  return data as T
}
