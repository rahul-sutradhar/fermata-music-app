import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  Search,
  Library,
  Plus,
  Music2,
  LogOut,
  Sun,
  Moon,
  User,
  Settings,
  History,
  Radio,
  Trash2,
  HelpCircle,
  Headphones,
  Sliders,
  Palette,
  ChevronDown,
  Download,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useThemeStore, parseHexToRgba, rgbaToHex, clampRgba } from '@/store/themeStore'
import { usePlayerStore } from '@/store/playerStore'
import { getMyPlaylists, createPlaylist, deletePlaylist } from '@/api/playlists'
import { listArtists } from '@/api/artists'
import type { Playlist, Artist } from '@/types'

export function parsePlaylistName(rawName: string) {
  try {
    const data = JSON.parse(rawName)
    return {
      name: data.name || 'Unnamed Playlist',
      artist: data.artist || '',
      description: data.description || '',
    }
  } catch {
    return {
      name: rawName || 'Unnamed Playlist',
      artist: '',
      description: '',
    }
  }
}



interface SidebarProps {
  onItemClick?: () => void
}

export default function Sidebar({ onItemClick }: SidebarProps) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { theme, toggleTheme, accentColor, setAccentColor } = useThemeStore()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const is3DEnabled = usePlayerStore((s) => s.is3DEnabled)
  const eqPreset = usePlayerStore((s) => s.eqPreset)
  const isEQEnabled = usePlayerStore((s) => s.isEQEnabled)
  const navigate = useNavigate()
  const [isColorMixerOpen, setIsColorMixerOpen] = useState(false)

  const handleMixerChange = (updates: Partial<{ r: number; g: number; b: number; a: number }>) => {
    const current = parseHexToRgba(accentColor)
    const nextRaw = { ...current, ...updates }
    const clamped = clampRgba(nextRaw.r, nextRaw.g, nextRaw.b, nextRaw.a)
    const nextHex = rgbaToHex(clamped.r, clamped.g, clamped.b, clamped.a)
    setAccentColor(nextHex)
  }

  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [isAccessoriesOpen, setIsAccessoriesOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Check if running in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone
    if (isStandalone) {
      setDeferredPrompt(null)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    console.log(`[PWA Install] User choice outcome: ${outcome}`)
    setDeferredPrompt(null)
  }

  const fetchPlaylists = () => {
    if (token) {
      getMyPlaylists()
        .then(setPlaylists)
        .catch(() => { })
    }
  }

  useEffect(() => {
    fetchPlaylists()
    const handleRefresh = () => fetchPlaylists()
    window.addEventListener('playlist-updated', handleRefresh)
    return () => window.removeEventListener('playlist-updated', handleRefresh)
  }, [token])

  const handleDeleteSidebarPlaylist = async (e: React.MouseEvent, pl: Playlist) => {
    e.preventDefault()
    e.stopPropagation()
    const info = parsePlaylistName(pl.name)
    if (!confirm(`Are you sure you want to delete "${info.name}"?`)) return
    try {
      await deletePlaylist(pl.id)
      setPlaylists((prev) => prev.filter((p) => p.id !== pl.id))
      if (window.location.hash.includes(`/playlist/${pl.id}`)) {
        navigate('/')
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete playlist')
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
      ? 'nav-active'
      : 'text-subtext hover:text-primary hover:bg-surface-highlight/50'
    }`

  return (
    <aside className="flex flex-col bg-base h-full w-full min-h-0 text-primary">
      {/* Fixed Logo (Premium Branding) */}
      <div className="p-6 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-spotify-green flex items-center justify-center shadow-md">
            <Music2 size={18} className="text-accent-text" />
          </div>
          <span className="text-xl font-bold tracking-tight text-primary">Fermata</span>
        </div>
      </div>

      {/* Main Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col scrollbar-thin">
        {/* Main Nav */}
        <nav className="px-3 mt-4 space-y-1 shrink-0">
          <NavLink to="/" className={linkClass} onClick={onItemClick} end>
            <Home size={20} />
            Home
          </NavLink>
          <NavLink to="/search" className={linkClass} onClick={onItemClick}>
            <Search size={20} />
            Search
          </NavLink>
          <NavLink to="/report-missing" className={linkClass} onClick={onItemClick}>
            <HelpCircle size={20} />
            Report Missing
          </NavLink>
          {token && (
            <>
              <NavLink to="/library" className={linkClass} onClick={onItemClick}>
                <Library size={20} />
                Your Library
              </NavLink>
              <NavLink to="/recents" className={linkClass} onClick={onItemClick}>
                <History size={20} />
                Recently Played
              </NavLink>
            </>
          )}
        </nav>

        {/* PWA Install Prompt Button */}
        {deferredPrompt && (
          <div className="px-3 mt-2 shrink-0">
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-semibold text-spotify-green bg-spotify-green/10 hover:bg-spotify-green/20 transition-all border border-spotify-green/20 cursor-pointer"
            >
              <Download size={20} className="animate-pulse" />
              Install Fermata App
            </button>
          </div>
        )}

        {/* Accessories Accordion Tab */}
        <div className="px-3 mt-4 shrink-0">
          <button
            onClick={() => setIsAccessoriesOpen(!isAccessoriesOpen)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-subtext hover:text-primary hover:bg-surface-highlight/50 transition-colors cursor-pointer"
          >
            <Sliders size={20} />
            <span>Accessories</span>
            <ChevronDown
              size={16}
              className={`ml-auto transition-transform duration-200 ${isAccessoriesOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isAccessoriesOpen && (
            <div className="pl-4 space-y-1 mt-1 border-l border-surface-highlight ml-5 transition-all">
              <button
                onClick={() => usePlayerStore.setState({ is3DModalOpen: true })}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-subtext hover:text-primary hover:bg-surface-highlight/50 transition-colors cursor-pointer"
              >
                <Headphones size={16} className={is3DEnabled ? "text-spotify-green animate-pulse" : ""} />
                <span>3D Audio</span>
                {is3DEnabled && (
                  <span className="ml-auto text-[9px] bg-spotify-green text-accent-text font-bold px-1.5 py-0.5 rounded leading-none">
                    ON
                  </span>
                )}
              </button>

              <button
                onClick={() => usePlayerStore.setState({ isEQModalOpen: true })}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-subtext hover:text-primary hover:bg-surface-highlight/50 transition-colors cursor-pointer"
              >
                <Sliders size={16} className={isEQEnabled ? "text-spotify-green" : ""} />
                <span>Equalizer</span>
                {isEQEnabled && (
                  <span className="ml-auto text-[9px] bg-spotify-green text-accent-text font-bold px-1.5 py-0.5 rounded leading-none uppercase">
                    {eqPreset === 'bass-booster' ? 'Bass' : eqPreset === 'treble-booster' ? 'Treble' : eqPreset}
                  </span>
                )}
              </button>

              <button
                onClick={() => setIsColorMixerOpen(!isColorMixerOpen)}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-subtext hover:text-primary hover:bg-surface-highlight/50 transition-colors cursor-pointer"
              >
                <Palette size={16} />
                <span>Accent Colour</span>
                <span
                  className="ml-auto w-3 h-3 rounded-full border border-white/20 shadow-sm flex-shrink-0 transition-all duration-300"
                  style={{ backgroundColor: accentColor }}
                />
              </button>

              {isColorMixerOpen && (() => {
                const { r, g, b, a } = parseHexToRgba(accentColor)
                return (
                  <div className="mx-2 px-3 py-2.5 rounded-lg bg-surface-highlight/20 border border-surface-highlight/40 space-y-3 text-[11px] animate-in slide-in-from-top-1 duration-150">
                    <div className="flex justify-between items-center text-subtext">
                      <span className="font-semibold text-primary">RGBA Mixer</span>
                      <span className="font-mono text-xs uppercase bg-surface-highlight/50 px-1.5 py-0.5 rounded text-spotify-green">
                        {accentColor}
                      </span>
                    </div>

                    {/* Red */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-subtext">
                        <span>Red</span>
                        <span className="font-mono font-bold text-red-400">{r}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={r}
                        onChange={(e) => handleMixerChange({ r: parseInt(e.target.value) })}
                        className="w-full h-1 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-red-500"
                      />
                    </div>

                    {/* Green */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-subtext">
                        <span>Green</span>
                        <span className="font-mono font-bold text-green-400">{g}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={g}
                        onChange={(e) => handleMixerChange({ g: parseInt(e.target.value) })}
                        className="w-full h-1 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-green-500"
                      />
                    </div>

                    {/* Blue */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-subtext">
                        <span>Blue</span>
                        <span className="font-mono font-bold text-blue-400">{b}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={b}
                        onChange={(e) => handleMixerChange({ b: parseInt(e.target.value) })}
                        className="w-full h-1 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>

                    {/* Alpha */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-subtext">
                        <span>Alpha (Opacity)</span>
                        <span className="font-mono font-bold text-purple-400">{Math.round(a * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="35"
                        max="100"
                        value={Math.round(a * 100)}
                        onChange={(e) => handleMixerChange({ a: parseInt(e.target.value) / 100 })}
                        className="w-full h-1 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>
                  </div>
                )
              })()}

              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-subtext hover:text-primary hover:bg-surface-highlight/50 transition-colors cursor-pointer"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Playlists (Fills remaining height when playlists are tall) */}
        {token && (
          <div className="flex-1 min-h-[160px] mt-6 px-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3 px-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtext">
                Playlists
              </span>
              <button
                onClick={() => window.dispatchEvent(new Event('open-create-playlist-modal'))}
                className="p-1 rounded-md text-subtext hover:text-primary hover:bg-surface-highlight transition-colors cursor-pointer"
                title="Create playlist"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
              {playlists.map((pl) => {
                const info = parsePlaylistName(pl.name)
                return (
                  <div key={pl.id} className="group/item flex items-center justify-between">
                    <NavLink
                      to={`/playlist/${pl.id}`}
                      className={({ isActive }) =>
                        `flex-1 px-3 py-2 rounded-lg text-sm truncate transition-colors duration-150 ${isActive
                          ? 'bg-surface-highlight text-primary'
                          : 'text-subtext hover:text-primary hover:bg-surface-highlight/50'
                        }`
                      }
                      onClick={onItemClick}
                    >
                      {info.name}
                    </NavLink>
                    <button
                      onClick={(e) => handleDeleteSidebarPlaylist(e, pl)}
                      className="p-1.5 opacity-0 group-hover/item:opacity-100 text-subtext hover:text-red-400 transition-all rounded shrink-0 mr-1"
                      title="Delete Playlist"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer / Profile options / Admin links / Logout */}
        <div
          className={`p-3 mt-auto border-t border-surface-highlight space-y-1 shrink-0 ${currentTrack ? 'sidebar-footer-active' : 'sidebar-footer-inactive'
            }`}
        >
          {token && user ? (
            <>
              <NavLink to="/profile" className={linkClass} onClick={onItemClick}>
                <User size={18} />
                {user.full_name || user.username}
              </NavLink>
              {(user.role === 'artist' || user.role === 'admin' || user.role === 'master_admin') && (
                <NavLink to="/artist-studio" className={linkClass} onClick={onItemClick}>
                  <Radio size={18} />
                  Artist Studio
                </NavLink>
              )}
              {(user.role === 'admin' || user.role === 'master_admin') && (
                <NavLink to="/admin" className={linkClass} onClick={onItemClick}>
                  <Settings size={18} />
                  Admin Console
                </NavLink>
              )}

              <button
                onClick={() => {
                  handleLogout()
                  onItemClick?.()
                }}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-subtext hover:text-red-400 hover:bg-surface-highlight/50 transition-colors cursor-pointer"
              >
                <LogOut size={18} />
                Logout
              </button>
            </>
          ) : (
            <NavLink to="/login" className={linkClass} onClick={onItemClick}>
              <User size={18} />
              Sign in
            </NavLink>
          )}
        </div>
      </div>
    </aside>
  )
}
