import { useEffect, useState, useRef } from 'react'
import { getMyPlaylists, addPlaylistItem } from '@/api/playlists'
import { useAuthStore } from '@/store/authStore'
import type { Playlist } from '@/types'
import { ListMusic, Check, Plus } from 'lucide-react'

interface Props {
  trackId: number
  onClose: () => void
}

export default function AddToPlaylistMenu({ trackId, onClose }: Props) {
  const token = useAuthStore((s) => s.token)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [addedTo, setAddedTo] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (token) {
      getMyPlaylists()
        .then(setPlaylists)
        .catch(() => {})
    }
  }, [token])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleAdd = async (playlistId: number) => {
    try {
      await addPlaylistItem(playlistId, trackId)
      setAddedTo(playlistId)
      setTimeout(onClose, 800)
    } catch {
      // silent
    }
  }

  if (!token) return null

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 z-50 w-56 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl py-1 animate-in fade-in"
    >
      <p className="px-3 py-2 text-xs font-semibold text-subtext uppercase tracking-wider">
        Add to playlist
      </p>
      {playlists.length === 0 && (
        <p className="px-3 py-2 text-sm text-subtext">No playlists yet</p>
      )}
      {playlists.map((pl) => (
        <button
          key={pl.id}
          onClick={() => handleAdd(pl.id)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-surface-highlight transition-colors"
        >
          <ListMusic size={14} className="text-subtext shrink-0" />
          <span className="truncate flex-1">{pl.name}</span>
          {addedTo === pl.id && <Check size={14} className="text-spotify-green shrink-0" />}
        </button>
      ))}
    </div>
  )
}
