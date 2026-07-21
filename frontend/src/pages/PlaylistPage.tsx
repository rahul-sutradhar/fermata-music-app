import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Music, Trash2, Edit2, Upload, X } from 'lucide-react'
import { getPlaylistItems, getMyPlaylists, deletePlaylist, updatePlaylist, uploadPlaylistCover } from '@/api/playlists'
import { usePlayerStore } from '@/store/playerStore'
import type { Track, PlaylistItem, Playlist } from '@/types'
import TrackList from '@/components/TrackList'
import { parsePlaylistName } from '@/components/Sidebar'

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [playlistInfo, setPlaylistInfo] = useState({ name: '', artist: '', description: '' })
  
  // Edit modal states
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [updating, setUpdating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)

  const loadData = async () => {
    if (!id) return
    try {
      setLoading(true)
      const [data, pls] = await Promise.all([
        getPlaylistItems(Number(id)),
        getMyPlaylists(),
      ])
      setItems(data)

      const currentPl = pls.find((p) => p.id === Number(id))
      if (currentPl) {
        setPlaylist(currentPl)
        const parsed = parsePlaylistName(currentPl.name)
        setPlaylistInfo(parsed)
        setEditName(parsed.name)
        setEditArtist(parsed.artist)
        setEditDesc(parsed.description)
      } else {
        setPlaylistInfo({ name: `Playlist #${id}`, artist: '', description: '' })
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    try {
      setUpdating(true)
      const serializedName = JSON.stringify({
        name: editName.trim() || playlistInfo.name,
        artist: editArtist.trim(),
        description: editDesc.trim(),
      })

      await updatePlaylist(Number(id), serializedName)

      if (coverFile) {
        await uploadPlaylistCover(Number(id), coverFile)
      }

      window.dispatchEvent(new Event('playlist-updated'))
      setIsEditOpen(false)
      setCoverFile(null)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to update playlist')
    } finally {
      setUpdating(false)
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
        <div className="relative group/cover w-48 h-48 rounded-lg bg-surface-highlight flex items-center justify-center shadow-2xl shrink-0 overflow-hidden">
          {playlist?.cover_url ? (
            <img src={playlist.cover_url} alt={playlistInfo.name} className="w-full h-full object-cover" />
          ) : (
            <Music size={64} className="text-subtext/40" />
          )}
          <button
            onClick={() => setIsEditOpen(true)}
            className="absolute inset-0 bg-black/50 opacity-0 group-hover/cover:opacity-100 flex flex-col items-center justify-center text-white transition-all text-xs font-semibold"
          >
            <Upload size={24} className="mb-1" />
            Change Cover
          </button>
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
          onClick={() => setIsEditOpen(true)}
          className="p-3 rounded-full bg-surface-highlight text-subtext hover:text-primary hover:bg-surface-highlight/80 transition-all shadow"
          title="Edit Playlist Details & Cover"
        >
          <Edit2 size={20} />
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

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleSaveEdit}
            className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">Edit Playlist</h2>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
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
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-subtext mb-1.5">
                Curated Artist / Owner Name
              </label>
              <input
                type="text"
                value={editArtist}
                onChange={(e) => setEditArtist(e.target.value)}
                placeholder="Artist name (optional)"
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-subtext mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Playlist description..."
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-subtext mb-1.5">
                Cover Image (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-subtext file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-surface-highlight file:text-primary hover:file:bg-surface-highlight/80 cursor-pointer"
              />
              <p className="text-[11px] text-subtext mt-1">Leave empty to keep default placeholder icon.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm font-medium hover:bg-surface-highlight transition-colors text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updating}
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-bold hover:bg-spotify-green-hover transition-colors disabled:opacity-50"
              >
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

