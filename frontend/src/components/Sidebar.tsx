import { useEffect, useState, useRef } from 'react'
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
  X,
  UserCheck,
  History,
  Radio,
  Trash2,
  HelpCircle,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
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

export default function Sidebar() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { theme, toggleTheme } = useThemeStore()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const navigate = useNavigate()

  const [playlists, setPlaylists] = useState<Playlist[]>([])

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
      ? 'bg-surface-highlight text-primary'
      : 'text-subtext hover:text-primary hover:bg-surface-highlight/50'
    }`

  return (
    <aside className={`flex flex-col bg-base h-full w-full min-h-0 ${currentTrack ? 'md:pb-20' : ''}`}>
      {/* Logo */}
      <div className="p-6 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-spotify-green flex items-center justify-center">
            <Music2 size={18} className="text-black" />
          </div>
          <span className="text-xl font-bold tracking-tight">Fermata</span>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="px-3 mt-4 space-y-1">
        <NavLink to="/" className={linkClass} end>
          <Home size={20} />
          Home
        </NavLink>
        <NavLink to="/search" className={linkClass}>
          <Search size={20} />
          Search
        </NavLink>
        <NavLink to="/report-missing" className={linkClass}>
          <HelpCircle size={20} />
          Report Missing
        </NavLink>
        {token && (
          <>
            <NavLink to="/library" className={linkClass}>
              <Library size={20} />
              Your Library
            </NavLink>
            <NavLink to="/recents" className={linkClass}>
              <History size={20} />
              Recently Played
            </NavLink>
          </>
        )}
      </nav>

      {/* Playlists */}
      {token && (
        <div className="flex-1 min-h-0 mt-6 px-3 overflow-hidden flex flex-col">
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


      {/* Footer */}
      <div 
        className="p-3 mt-auto border-t border-surface-highlight space-y-1"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-subtext hover:text-primary hover:bg-surface-highlight/50 transition-colors"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>

        {token && user ? (
          <>
            <NavLink to="/profile" className={linkClass}>
              <User size={18} />
              {user.full_name || user.username}
            </NavLink>
            {(user.role === 'artist' || user.role === 'admin') && (
              <NavLink to="/artist-studio" className={linkClass}>
                <Radio size={18} />
                Artist Studio
              </NavLink>
            )}
            {user.role === 'admin' && (
              <NavLink to="/admin" className={linkClass}>
                <Settings size={18} />
                Admin Console
              </NavLink>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-subtext hover:text-red-400 hover:bg-surface-highlight/50 transition-colors"
            >
              <LogOut size={18} />
              Logout
            </button>
          </>
        ) : (
          <NavLink to="/login" className={linkClass}>
            <User size={18} />
            Sign in
          </NavLink>
        )}
      </div>

      {/* Playlist Creation Modal removed - now handled globally in Layout.tsx */}
    </aside>
  )
}
