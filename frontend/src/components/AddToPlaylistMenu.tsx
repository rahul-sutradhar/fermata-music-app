import { useEffect, useState, useRef } from 'react'
import { getMyPlaylists, addPlaylistItem, deletePlaylistItem, getPlaylistItems } from '@/api/playlists'
import { useAuthStore } from '@/store/authStore'
import type { Playlist } from '@/types'
import { ListMusic, Check, Trash2 } from 'lucide-react'
import { parsePlaylistName } from './Sidebar'

interface Props {
  trackId: number
  onClose: () => void
  playlistId?: number
}

export default function AddToPlaylistMenu({ trackId, onClose, playlistId }: Props) {
  const token = useAuthStore((s) => s.token)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [addedTo, setAddedTo] = useState<number | null>(null)
  const [containedInPlaylists, setContainedInPlaylists] = useState<Record<number, boolean>>({})
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (token) {
      getMyPlaylists()
        .then(async (pls) => {
          setPlaylists(pls)
          
          // Check which playlists already contain this track
          const containedMap: Record<number, boolean> = {}
          await Promise.all(
            pls.map(async (pl) => {
              try {
                const items = await getPlaylistItems(pl.id)
                const exists = items.some((item) => item.track.id === trackId)
                if (exists) {
                  containedMap[pl.id] = true
                }
              } catch (err) {
                console.error('[PlaylistCheck] Failed to load items:', pl.id, err)
              }
            })
          )
          setContainedInPlaylists(containedMap)
        })
        .catch(() => {})
    }
  }, [token, trackId])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleAdd = async (targetPlaylistId: number) => {
    try {
      await addPlaylistItem(targetPlaylistId, trackId)
      setAddedTo(targetPlaylistId)
      setContainedInPlaylists((prev) => ({ ...prev, [targetPlaylistId]: true }))
      window.dispatchEvent(new Event('playlist-updated'))
      setTimeout(onClose, 800)
    } catch {
      // silent
    }
  }

  if (!token) return null

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()} // Stop event bubbling so clicking list items doesn't play the song
      className="absolute right-0 top-8 z-50 w-56 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl py-1 animate-in fade-in"
    >
      <p className="px-3 py-2 text-xs font-semibold text-subtext uppercase tracking-wider">
        Options
      </p>

      {playlistId && (
        <button
          type="button"
          onClick={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            try {
              console.log(`Removing Track ID: ${trackId} from Playlist ID: ${playlistId}`)
              await deletePlaylistItem(playlistId, trackId)
              window.dispatchEvent(new Event('playlist-updated'))
              onClose()
            } catch (err: any) {
              alert('Failed to remove: ' + (err.message || String(err)))
              console.error('Failed to remove track:', err)
            }
          }}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-left hover:bg-surface-highlight text-red-400 hover:text-red-300 transition-colors border-b border-surface-highlight/30 mb-1 cursor-pointer"
        >
          <Trash2 size={13} className="shrink-0" />
          <span className="truncate flex-1">Remove from playlist</span>
        </button>
      )}

      {playlists.length === 0 && (
        <p className="px-3 py-2 text-sm text-subtext">No playlists yet</p>
      )}

      {playlists.map((pl) => {
        const info = parsePlaylistName(pl.name)
        const isAlreadyAdded = containedInPlaylists[pl.id] || addedTo === pl.id

        return (
          <button
            key={pl.id}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              handleAdd(pl.id)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-surface-highlight transition-colors cursor-pointer"
          >
            <ListMusic size={14} className="text-subtext shrink-0" />
            <span className="truncate flex-1">{info.name}</span>
            {isAlreadyAdded && <Check size={14} className="text-spotify-green shrink-0 font-bold" />}
          </button>
        )
      })}
    </div>
  )
}
