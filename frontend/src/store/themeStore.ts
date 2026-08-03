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

export const parseHexToRgba = (hex: string) => {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0
  const a = cleanHex.length >= 8 ? parseInt(cleanHex.substring(6, 8), 16) / 255 : 1
  return { r, g, b, a }
}

export const rgbaToHex = (r: number, g: number, b: number, a: number) => {
  const rr = Math.round(r).toString(16).padStart(2, '0')
  const gg = Math.round(g).toString(16).padStart(2, '0')
  const bb = Math.round(b).toString(16).padStart(2, '0')
  const aa = Math.round(a * 255).toString(16).padStart(2, '0')
  return `#${rr}${gg}${bb}${aa}`
}

export const clampRgba = (r: number, g: number, b: number, a: number) => {
  let targetR = Math.max(0, Math.min(255, r))
  let targetG = Math.max(0, Math.min(255, g))
  let targetB = Math.max(0, Math.min(255, b))
  let targetA = Math.max(0.35, Math.min(1.0, a))

  let luminance = (0.299 * targetR + 0.587 * targetG + 0.114 * targetB) / 255
  if (luminance > 0.8) {
    const factor = 0.8 / luminance
    targetR = Math.round(targetR * factor)
    targetG = Math.round(targetG * factor)
    targetB = Math.round(targetB * factor)
  } else if (luminance < 0.15) {
    if (targetR < 25 && targetG < 25 && targetB < 25) {
      targetR = Math.max(targetR, 25)
      targetG = Math.max(targetG, 25)
      targetB = Math.max(targetB, 25)
      luminance = (0.299 * targetR + 0.587 * targetG + 0.114 * targetB) / 255
    }
    const factor = 0.15 / Math.max(0.01, luminance)
    targetR = Math.min(255, Math.round(targetR * factor))
    targetG = Math.min(255, Math.round(targetG * factor))
    targetB = Math.min(255, Math.round(targetB * factor))

    const newLum = (0.299 * targetR + 0.587 * targetG + 0.114 * targetB) / 255
    if (newLum < 0.15) {
      const diff = 0.15 - newLum
      const addValue = Math.ceil(diff * 255)
      targetR = Math.min(255, targetR + addValue)
      targetG = Math.min(255, targetG + addValue)
      targetB = Math.min(255, targetB + addValue)
    }
  }

  return { r: targetR, g: targetG, b: targetB, a: targetA }
}

export const applyAccent = (hex: string) => {
  const rawColor = hex || '#7c3aed'
  const parsed = parseHexToRgba(rawColor)
  const clamped = clampRgba(parsed.r, parsed.g, parsed.b, parsed.a)
  const primary = rgbaToHex(clamped.r, clamped.g, clamped.b, clamped.a)
  const hover = adjustColorBrightness(primary, 18)

  const r = clamped.r
  const g = clamped.g
  const b = clamped.b

  // WCAG-based relative luminance — choose black or white text for best contrast
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const accentText = luminance > 0.55 ? '#000000' : '#ffffff'

  const root = document.documentElement
  root.style.setProperty('--spotify-green', primary)
  root.style.setProperty('--spotify-green-hover', hover)
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--accent-muted', `rgba(${r}, ${g}, ${b}, 0.12)`)
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.4)`)
  root.style.setProperty('--accent-subtle', `rgba(${r}, ${g}, ${b}, 0.06)`)
  root.style.setProperty('--accent-text', accentText)

  // Synchronize PWA title bar color / browser theme-color meta tag dynamically
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', primary)
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
