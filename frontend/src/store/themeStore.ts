import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const ACCENT_COLORS = {
  green: { primary: '#1db954', hover: '#1ed760' },
  pink: { primary: '#ec4899', hover: '#f472b6' },
  purple: { primary: '#8b5cf6', hover: '#a78bfa' },
  blue: { primary: '#0ea5e9', hover: '#38bdf8' },
  amber: { primary: '#f59e0b', hover: '#fbbf24' }
}

export type ThemeAccent = 'green' | 'pink' | 'purple' | 'blue' | 'amber'

export const applyAccent = (accent: ThemeAccent) => {
  const colors = ACCENT_COLORS[accent] || ACCENT_COLORS.green
  document.documentElement.style.setProperty('--spotify-green', colors.primary)
  document.documentElement.style.setProperty('--spotify-green-hover', colors.hover)
}

interface ThemeState {
  theme: 'dark' | 'light'
  accent: ThemeAccent
  toggleTheme: () => void
  setAccent: (accent: ThemeAccent) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      accent: 'green',
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === 'dark' ? 'light' : 'dark'
          if (next === 'light') {
            document.documentElement.classList.add('light')
          } else {
            document.documentElement.classList.remove('light')
          }
          return { theme: next }
        }),
      setAccent: (accent) => {
        applyAccent(accent)
        set({ accent })
      }
    }),
    {
      name: 'fermata-theme',
    },
  ),
)
