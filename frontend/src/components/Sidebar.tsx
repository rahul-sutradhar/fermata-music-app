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
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { getMyPlaylists, createPlaylist } from '@/api/playlists'
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
  const navigate = useNavigate()

  const [playlists, setPlaylists] = useState<Playlist[]>([])

  // Playlist creation dialog states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [playlistName, setPlaylistName] = useState('')
  const [playlistDesc, setPlaylistDesc] = useState('')
  const [artistId, setArtistId] = useState('')
  const [artistSearch, setArtistSearch] = useState('')
  const [artistsList, setArtistsList] = useState<Artist[]>([])
  const [showArtistDropdown, setShowArtistDropdown] = useState(false)
  const artistDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (token) {
      getMyPlaylists()
        .then(setPlaylists)
        .catch(() => {})
    }
  }, [token])

  useEffect(() => {
    if (isModalOpen) {
      listArtists(0, 200)
        .then(setArtistsList)
        .catch(console.error)
    }
  }, [isModalOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(event.target as Node)) {
        setShowArtistDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    try {
      const selectedArtistName =
        artistId === 'unknown'
          ? 'Unknown Artist'
          : artistsList.find((a) => a.id === Number(artistId))?.name || 'Unknown Artist'

      const serializedName = JSON.stringify({
        name: playlistName.trim() || `My Playlist #${playlists.length + 1}`,
        artist: selectedArtistName,
        description: playlistDesc.trim(),
      })

      const pl = await createPlaylist(serializedName)
      setPlaylists((prev) => [...prev, pl])
      setIsModalOpen(false)
      setPlaylistName('')
      setPlaylistDesc('')
      setArtistId('')
      navigate(`/playlist/${pl.id}`)
    } catch {
      // silent
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-surface-highlight text-primary'
        : 'text-subtext hover:text-primary hover:bg-surface-highlight/50'
    }`

  return (
    <aside className="w-72 flex flex-col bg-base h-full shrink-0">
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
        {token && (
          <NavLink to="/library" className={linkClass}>
            <Library size={20} />
            Your Library
          </NavLink>
        )}
      </nav>

      {/* Playlists */}
      {token && (
        <div className="flex-1 mt-6 px-3 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3 px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-subtext">
              Playlists
            </span>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1 rounded-md text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
              title="Create playlist"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
            {playlists.map((pl) => {
              const info = parsePlaylistName(pl.name)
              return (
                <NavLink
                  key={pl.id}
                  to={`/playlist/${pl.id}`}
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-lg text-sm truncate transition-colors duration-150 ${
                      isActive
                        ? 'bg-surface-highlight text-primary'
                        : 'text-subtext hover:text-primary hover:bg-surface-highlight/50'
                    }`
                  }
                >
                  {info.name}
                </NavLink>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-3 mt-auto border-t border-surface-highlight space-y-1">
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
              {user.username}
            </NavLink>
            {(user.role === 'artist' || user.role === 'admin') && (
              <NavLink to="/admin" className={linkClass}>
                <Settings size={18} />
                Admin Panel
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

      {/* Custom Playlist Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">Create New Playlist</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full text-subtext hover:text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-subtext mb-1.5">
                Playlist Name
              </label>
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder={`My Playlist #${playlists.length + 1}`}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-subtext mb-1.5">
                Preferences / Description
              </label>
              <input
                type="text"
                value={playlistDesc}
                onChange={(e) => setPlaylistDesc(e.target.value)}
                placeholder="Chill hits, high energy..."
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>

            {/* Searchable Artist Dropdown */}
            <div className="relative animate-in fade-in duration-200" ref={artistDropdownRef}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-subtext mb-1.5">
                Artist
              </label>
              <div
                onClick={() => setShowArtistDropdown(!showArtistDropdown)}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary cursor-pointer border-2 border-transparent hover:border-spotify-green/50 flex justify-between items-center transition-colors"
              >
                <span className="truncate">
                  {artistId === 'unknown'
                    ? 'Unknown Artist'
                    : artistId
                    ? artistsList.find((a) => a.id === Number(artistId))?.name || 'Select Artist...'
                    : 'Select Artist...'}
                </span>
                <span className="text-xs text-subtext select-none">▼</span>
              </div>

              {showArtistDropdown && (
                <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl z-50 p-2 space-y-2 max-h-60 overflow-hidden flex flex-col">
                  <input
                    type="text"
                    placeholder="Search artist..."
                    value={artistSearch}
                    onChange={(e) => setArtistSearch(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md bg-surface-highlight text-xs text-primary outline-none border border-transparent focus:border-spotify-green/30"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
                    <div
                      onClick={() => {
                        setArtistId('unknown')
                        setShowArtistDropdown(false)
                        setArtistSearch('')
                      }}
                      className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-primary flex justify-between items-center border-b border-surface-highlight/30"
                    >
                      <span className="font-semibold">Unknown Artist (Choose)</span>
                    </div>

                    {artistsList
                      .filter((a) =>
                        a.name.toLowerCase().includes(artistSearch.toLowerCase())
                      )
                      .map((a) => (
                        <div
                          key={a.id}
                          onClick={() => {
                            setArtistId(String(a.id))
                            setShowArtistDropdown(false)
                            setArtistSearch('')
                          }}
                          className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-primary flex justify-between items-center"
                        >
                          <span className="truncate mr-2">{a.name}</span>
                          <span className="text-[10px] text-subtext shrink-0">ID: {a.id}</span>
                        </div>
                      ))}
                    {artistsList.filter((a) =>
                      a.name.toLowerCase().includes(artistSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-3 py-2 text-xs text-subtext text-center">
                        No matches found (Select Unknown)
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm font-medium hover:bg-surface-highlight transition-colors text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-bold hover:bg-spotify-green-hover transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  )
}
