import { apiRequest } from './client'
import type { User, TokenResponse } from '@/types'

export function register(username: string, email: string, password: string, fullName?: string) {
  return apiRequest<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, full_name: fullName }),
  })
}

export function login(username: string, password: string) {
  return apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, grant_type: 'password' }),
  })
}

export function refreshToken(refreshToken: string) {
  return apiRequest<TokenResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}

export function logout(refreshToken?: string) {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
  })
}

export function getMe() {
  return apiRequest<User>('/auth/me')
}
