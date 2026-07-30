import { apiRequest } from './client'
import type { User, TokenResponse } from '@/types'

export function register(username: string, email: string, password: string, fullName?: string, captchaToken?: string) {
  return apiRequest<User>('/auth/register', {
    method: 'POST',
    headers: captchaToken ? { 'X-CAPTCHA-Token': captchaToken } : {},
    body: JSON.stringify({ username, email, password, full_name: fullName }),
  })
}

export function login(username: string, password: string, captchaToken?: string) {
  return apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(captchaToken ? { 'X-CAPTCHA-Token': captchaToken } : {})
    },
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
