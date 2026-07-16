import { apiRequest } from './client'
import type { User } from '@/types'

export function listUsers(skip = 0, limit = 100) {
  return apiRequest<User[]>(`/admin/users?skip=${skip}&limit=${limit}`)
}

export function createUser(data: {
  username: string
  email: string
  password: string
  role: string
}) {
  return apiRequest<User>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateUser(
  id: number,
  data: { username?: string; email?: string; role?: string },
) {
  return apiRequest<User>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteUser(id: number) {
  return apiRequest<void>(`/admin/users/${id}`, {
    method: 'DELETE',
  })
}
