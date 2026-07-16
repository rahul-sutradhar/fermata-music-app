import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  setAuth: (token: string, refreshToken?: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (token, refreshToken) =>
        set({ token, refreshToken: refreshToken ?? null }),
      setUser: (user) => set({ user }),
      logout: () =>
        set({ token: null, refreshToken: null, user: null }),
    }),
    {
      name: 'fermata-auth',
    },
  ),
)
