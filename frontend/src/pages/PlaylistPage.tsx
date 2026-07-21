import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Music, Trash2 } from 'lucide-react'
import { getPlaylistItems, getMyPlaylists, deletePlaylist } from '@/api/playlists'
import { usePlayerStore } from '@/store/playerStore'
import type { Track, PlaylistItem } from '@/types'
import TrackList from '@/components/TrackList'
import { parsePlaylistName } from '@/components/Sidebar'

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [playlistInfo, setPlaylistInfo] = useState({ name: '', artist: '', description: '' })
  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        setLoading(true)
        const [data, pls] = await Promise.all([
          getPlaylistItems(Number(id)),
          getMyPlaylists(),
        ])
        setItems(data)

        const currentPl = pls.find((p) => p.id === Number(id))
        if (currentPl) {
          setPlaylistInfo(parsePlaylistName(currentPl.name))
        } else {
          setPlaylistInfo({ name: `Playlist #${id}`, artist: '', description: '' })
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const tracks = items
    .sort((a, b) => a.position - b.position)
    .map((item) => item.track)

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setQueue(tracks)
      setTrack(tracks[0])
    }
  }

  const handleDeletePlaylist = async () => {
    if (!id) return
    if (!confirm(`Are you sure you want to delete "${playlistInfo.name}"?`)) return
    try {
      await deletePlaylist(Number(id))
      window.dispatchEvent(new Event('playlist-updated'))
      navigate('/')
    } catch (err: any) {
      alert(err.message || 'Failed to delete playlist')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end gap-6 mb-8">
        <div className="w-48 h-48 rounded-lg bg-surface-highlight flex items-center justify-center shadow-2xl shrink-0">
          <Music size={64} className="text-subtext/40" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-subtext mb-1">Playlist</p>
          <h1 className="text-4xl font-bold mb-2 truncate">{playlistInfo.name}</h1>
          {playlistInfo.artist && (
            <p className="text-sm font-semibold text-spotify-green mb-1">Curated by {playlistInfo.artist}</p>
          )}
          {playlistInfo.description && (
            <p className="text-sm text-subtext mb-1 line-clamp-2">{playlistInfo.description}</p>
          )}
          <p className="text-sm text-subtext">
            {tracks.length} track{tracks.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handlePlayAll}
          className="w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 hover:bg-spotify-green-hover transition-all shadow-lg"
          disabled={tracks.length === 0}
          title="Play Playlist"
        >
          <Play size={22} className="text-black ml-0.5" fill="currentColor" />
        </button>

        <button
          onClick={handleDeletePlaylist}
          className="p-3 rounded-full bg-surface-highlight text-subtext hover:text-red-400 hover:bg-surface-highlight/80 transition-all shadow"
          title="Delete Playlist"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Tracks */}
      {tracks.length > 0 ? (
        <TrackList tracks={tracks} />
      ) : (
        <div className="py-12 text-center text-subtext">
          <p className="text-lg font-medium">This playlist is empty</p>
          <p className="text-sm mt-1">Find tracks and add them here</p>
        </div>
      )}
    </div>
  )
}
