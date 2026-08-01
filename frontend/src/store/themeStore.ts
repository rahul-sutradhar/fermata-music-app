import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const adjustColorBrightness = (hex: string, percent: number) => {
  hex = hex.replace(/^\s*#|\s*$/g, '')
  if (hex.length === 3) {
    hex = hex.replace(/(.)/g, '$1$1')
  }
  let r = parseInt(hex.substring(0, 2), 16)
  let g = parseInt(hex.substring(2, 4), 16)
  let b = parseInt(hex.substring(4, 6), 16)

  r = Math.min(255, Math.max(0, r + (r * percent) / 100))
  g = Math.min(255, Math.max(0, g + (g * percent) / 100))
  b = Math.min(255, Math.max(0, b + (b * percent) / 100))

  // For very bright colors, darken instead of lighten on hover
  if (percent > 0 && (r > 220 && g > 220 && b > 220)) {
    percent = -15
    r = Math.min(255, Math.max(0, r + (r * percent) / 100))
    g = Math.min(255, Math.max(0, g + (g * percent) / 100))
    b = Math.min(255, Math.max(0, b + (b * percent) / 100))
  }

  const rr = Math.round(r).toString(16).padStart(2, '0')
  const gg = Math.round(g).toString(16).padStart(2, '0')
  const bb = Math.round(b).toString(16).padStart(2, '0')

  return `#${rr}${gg}${bb}`
}

export const applyAccent = (hex: string) => {
  const primary = hex || '#7c3aed'
  const hover = adjustColorBrightness(primary, 18)

  // Derive RGB components for CSS alpha compositing
  const r = parseInt(primary.replace('#', '').substring(0, 2), 16)
  const g = parseInt(primary.replace('#', '').substring(2, 4), 16)
  const b = parseInt(primary.replace('#', '').substring(4, 6), 16)

  const root = document.documentElement
  root.style.setProperty('--spotify-green', primary)
  root.style.setProperty('--spotify-green-hover', hover)
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--accent-muted', `rgba(${r}, ${g}, ${b}, 0.12)`)
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.4)`)
  root.style.setProperty('--accent-subtle', `rgba(${r}, ${g}, ${b}, 0.06)`)
}

interface ThemeState {
  theme: 'dark' | 'light'
  accentColor: string
  toggleTheme: () => void
  setAccentColor: (hex: string) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      accentColor: '#7c3aed',
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
      setAccentColor: (hex) => {
        applyAccent(hex)
        set({ accentColor: hex })
      }
    }),
    {
      name: 'fermata-theme',
    },
  ),
)
