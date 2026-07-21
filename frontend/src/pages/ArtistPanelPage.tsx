import { useEffect, useState, useRef } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Search,
  Music,
  Disc,
  Image as ImageIcon,
  Play,
  ChevronDown,
  ChevronRight,
  FolderMinus,
} from 'lucide-react'
import {
  listTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  uploadTrackAudio,
  uploadTrackCover,
} from '@/api/tracks'
import { listArtists, createArtist, getArtistSingles } from '@/api/artists'
import {
  listAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  uploadAlbumCover,
  getAlbumTracks,
} from '@/api/albums'
import type { Track, Artist, Album } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { usePlayerStore } from '@/store/playerStore'
import TrackFormModal from '@/components/TrackFormModal'
import ImageCropperModal from '@/components/ImageCropperModal'

type TabType = 'tracks' | 'albums'

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}


export default function ArtistPanelPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<TabType>('tracks')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)

  // Player store integration
  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  // Artist profile state
  const [myArtist, setMyArtist] = useState<Artist | null>(null)
  const [profileCreating, setProfileCreating] = useState(false)

  // Data states
  const [myAlbums, setMyAlbums] = useState<Album[]>([])
  const [myTracks, setMyTracks] = useState<Track[]>([])

  // Accordion state for albums expansion
  const [expandedAlbumIds, setExpandedAlbumIds] = useState<Set<number>>(new Set())

  // Modal control states
  const [trackModalOpen, setTrackModalOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)

  const [albumModalOpen, setAlbumModalOpen] = useState(false)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [albumFormTitle, setAlbumFormTitle] = useState('')
  const [albumCoverFile, setAlbumCoverFile] = useState<File | null>(null)
  const [albumCoverPreview, setAlbumCoverPreview] = useState<string | null>(null)
  const albumCoverInputRef = useRef<HTMLInputElement>(null)

  // Cropper modal state
  const [cropperOpen, setCropperOpen] = useState(false)
  const [cropperFile, setCropperFile] = useState<File | null>(null)
  const [cropCallback, setCropCallback] = useState<((file: File) => void) | null>(null)

  const openImageCropper = (file: File, callback: (croppedFile: File) => void) => {
    setCropperFile(file)
    setCropCallback(() => callback)
    setCropperOpen(true)
  }

  // Upload state tracking
  const [uploadingForId, setUploadingForId] = useState<number | null>(null)

  // Toggle album expanded state
  const toggleAlbumExpand = (albumId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setExpandedAlbumIds((prev) => {
      const next = new Set(prev)
      if (next.has(albumId)) {
        next.delete(albumId)
      } else {
        next.add(albumId)
      }
      return next
    })
  }

  // Load Artist Profile & Data
  const loadArtistData = async () => {
    if (!currentUser) return
    setLoading(true)
    try {
      // 1. Fetch artist profile linked to current user
      const allArtists = await listArtists(0, 200)
      let profile = allArtists.find(
        (a) => Number(a.user_id) === Number(currentUser.id) || Number(a.id) === Number(currentUser.id),
      )

      if (!profile) {
        setProfileCreating(true)
        try {
          profile = await createArtist({ name: currentUser.username, user_id: currentUser.id })
        } catch (e) {
          console.error('Auto profile creation failed:', e)
        } finally {
          setProfileCreating(false)
        }
      }

      setMyArtist(profile || null)

      if (profile) {
        // 2. Fetch albums belonging to this artist
        const allAlbums = await listAlbums(0, 200)
        const filteredAlbums = allAlbums.filter((al) => Number(al.artist_id) === Number(profile!.id))
        setMyAlbums(filteredAlbums)

        // 3. Fetch tracks belonging to this artist
        const albumTracksPromises = filteredAlbums.map((al) =>
          getAlbumTracks(al.id, 0, 100).catch(() => [] as Track[]),
        )
        const singlesPromise = getArtistSingles(profile.id, 0, 100).catch(() => [] as Track[])
        const allTracksPromise = listTracks(0, 200).catch(() => [] as Track[])

        const [albumTrackGroups, singles, allTracks] = await Promise.all([
          Promise.all(albumTracksPromises),
          singlesPromise,
          allTracksPromise,
        ])

        const myAlbumIds = new Set(filteredAlbums.map((al) => Number(al.id)))
        const trackMap = new Map<number, Track>()

        albumTrackGroups.flat().forEach((t) => trackMap.set(t.id, t))
        singles.forEach((t) => trackMap.set(t.id, t))
        allTracks.forEach((t) => {
          if (
            (t.album_id && myAlbumIds.has(Number(t.album_id))) ||
            (t.artist_id && Number(t.artist_id) === Number(profile!.id)) ||
            (t.artist_name && t.artist_name.toLowerCase() === profile!.name.toLowerCase())
          ) {
            trackMap.set(t.id, t)
          }
        })

        setMyTracks(Array.from(trackMap.values()))
      }
    } catch (err) {
      console.error('Failed to load artist panel data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadArtistData()
  }, [currentUser])

  // Play track helper
  const handlePlayTrack = (track: Track, trackList: Track[], e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!track.audio_url) {
      alert('No audio file has been uploaded for this track yet.')
      return
    }
    setQueue(trackList)
    setTrack(track)
    setIsPlaying(true)
  }

  // Play entire album helper
  const handlePlayAlbum = (album: Album, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const albumTracks = myTracks.filter((t) => Number(t.album_id) === Number(album.id))
    if (albumTracks.length === 0) {
      alert('This album has no tracks yet.')
      return
    }
    const playableTracks = albumTracks.filter((t) => t.audio_url)
    if (playableTracks.length === 0) {
      alert('None of the tracks in this album have audio uploaded yet.')
      return
    }
    setQueue(playableTracks)
    setTrack(playableTracks[0])
    setIsPlaying(true)
  }

  // Remove track from album (Convert to Single)
  const handleRemoveTrackFromAlbum = async (trackId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!confirm('Remove this track from the album? (It will become a standalone Single track)')) return
    try {
      await updateTrack(trackId, { album_id: null })
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to remove track from album')
    }
  }

  // Track CRUD Actions
  const handleTrackSubmit = async (data: {
    title: string
    album_id: number | null
    artist_id?: number | null
    duration_seconds?: number
    audioFile?: File
    coverFile?: File
  }) => {
    try {
      let targetTrack: Track
      if (editingTrack) {
        targetTrack = await updateTrack(editingTrack.id, {
          title: data.title,
          album_id: data.album_id,
          artist_id: myArtist?.id,
          duration_seconds: data.duration_seconds,
        })
      } else {
        targetTrack = await createTrack(data.title, data.album_id, data.duration_seconds, myArtist?.id)
      }

      if (data.audioFile) {
        setUploadingForId(targetTrack.id)
        await uploadTrackAudio(targetTrack.id, data.audioFile)
      }
      if (data.coverFile) {
        setUploadingForId(targetTrack.id)
        await uploadTrackCover(targetTrack.id, data.coverFile)
      }

      setTrackModalOpen(false)
      setEditingTrack(null)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to save track')
    } finally {
      setUploadingForId(null)
    }
  }

  const handleTrackDelete = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!confirm('Are you sure you want to delete this track?')) return
    try {
      await deleteTrack(id)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete track')
    }
  }

  const handleUploadAudio = async (trackId: number, file: File) => {
    setUploadingForId(trackId)
    try {
      await uploadTrackAudio(trackId, file)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to upload audio')
    } finally {
      setUploadingForId(null)
    }
  }

  const handleUploadTrackCover = async (trackId: number, file: File) => {
    setUploadingForId(trackId)
    try {
      await uploadTrackCover(trackId, file)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to upload track cover')
    } finally {
      setUploadingForId(null)
    }
  }

  // Album CRUD Actions
  const openAlbumModal = (album: Album | null = null) => {
    setEditingAlbum(album)
    setAlbumCoverFile(null)
    setAlbumCoverPreview(album?.cover_url || null)
    setAlbumFormTitle(album ? album.title : '')
    setAlbumModalOpen(true)
  }

  const handleAlbumSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myArtist) {
      alert('Artist profile not initialized')
      return
    }

    const payload = {
      title: albumFormTitle,
      artist_id: myArtist.id,
    }

    try {
      let savedAlbum: Album
      if (editingAlbum) {
        savedAlbum = await updateAlbum(editingAlbum.id, payload)
      } else {
        savedAlbum = await createAlbum(payload)
      }

      if (albumCoverFile) {
        setUploadingForId(savedAlbum.id)
        await uploadAlbumCover(savedAlbum.id, albumCoverFile)
      }

      setAlbumModalOpen(false)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to save album')
    } finally {
      setUploadingForId(null)
    }
  }

  const handleUploadAlbumCover = async (albumId: number, file: File) => {
    setUploadingForId(albumId)
    try {
      await uploadAlbumCover(albumId, file)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to upload album cover')
    } finally {
      setUploadingForId(null)
    }
  }

  const handleAlbumDelete = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!confirm('Are you sure you want to delete this album and all its tracks?')) return
    try {
      await deleteAlbum(id)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete album')
    }
  }

  // Search filtering
  // Search filtering & Alphabetical sorting
  const displayedTracks = [...myTracks]
    .filter((t) => t.title.toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

  const displayedAlbums = [...myAlbums]
    .filter((al) => al.title.toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))


  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Artist Studio</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green text-xs font-semibold">
              {myArtist?.name || currentUser?.username}
            </span>
          </div>
          <p className="text-sm text-subtext mt-1">
            Manage your discography, release albums, upload tracks and cover photos
          </p>
        </div>

        {/* Create Action Button */}
        {activeTab === 'tracks' && (
          <button
            onClick={() => {
              setEditingTrack(null)
              setTrackModalOpen(true)
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Upload Track
          </button>
        )}

        {activeTab === 'albums' && (
          <button
            onClick={() => openAlbumModal()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Create Album
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-highlight mb-4 gap-2">
        <button
          onClick={() => {
            setActiveTab('tracks')
            setSearchQ('')
          }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'tracks'
              ? 'border-spotify-green text-spotify-green'
              : 'border-transparent text-subtext hover:text-primary'
          }`}
        >
          <Music size={16} />
          My Tracks ({myTracks.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('albums')
            setSearchQ('')
          }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'albums'
              ? 'border-spotify-green text-spotify-green'
              : 'border-transparent text-subtext hover:text-primary'
          }`}
        >
          <Disc size={16} />
          My Albums ({myAlbums.length})
        </button>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
        <input
          type="text"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={`Search my ${activeTab}...`}
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-primary/20 transition-colors placeholder:text-subtext/50"
        />
      </div>

      {/* Main Content Area */}
      {loading || profileCreating ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-subtext">Loading discography...</p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-highlight overflow-hidden bg-surface-elevated/40 animate-in fade-in duration-200">
          {/* TRACKS TABLE */}
          {activeTab === 'tracks' && (
            <>
              <div className="grid grid-cols-[40px_1fr_140px_110px_110px_90px_180px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Title</span>
                <span>Album</span>
                <span>Created</span>
                <span>Updated</span>
                <span>Duration</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {displayedTracks.length === 0 ? (
                  <div className="py-16 text-center text-subtext text-sm">
                    {searchQ ? 'No matching tracks found' : 'You haven’t uploaded any tracks yet'}
                  </div>
                ) : (
                  displayedTracks.map((track, index) => {
                    const album = myAlbums.find((a) => Number(a.id) === Number(track.album_id))
                    const isCurrentPlaying = currentTrack?.id === track.id && isPlaying

                    return (
                      <div
                        key={track.id}
                        onClick={() => handlePlayTrack(track, displayedTracks)}
                        className={`grid grid-cols-[40px_1fr_140px_110px_110px_90px_180px] gap-4 items-center px-4 py-3 cursor-pointer transition-colors ${
                          isCurrentPlaying
                            ? 'bg-spotify-green/15 text-spotify-green font-semibold'
                            : 'hover:bg-surface-highlight/20'
                        }`}
                      >
                        <span className="text-xs font-semibold text-subtext tabular-nums">
                          {index + 1}
                        </span>

                        <div className="flex items-center gap-3 min-w-0">
                          {track.cover_url ? (
                            <img
                              src={track.cover_url}
                              alt={track.title}
                              className="w-10 h-10 rounded-md object-cover shrink-0 shadow"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                              <Music size={18} className="text-subtext/50" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{track.title}</p>
                            {track.audio_url ? (
                              <span className="text-[10px] text-spotify-green">Audio attached</span>
                            ) : (
                              <span className="text-[10px] text-subtext">No audio</span>
                            )}
                          </div>
                        </div>

                        {/* Album / Single badge */}
                        <span className="text-sm truncate">
                          {track.album_id ? (
                            <span className="text-subtext font-medium truncate block">{album?.title || `Album #${track.album_id}`}</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green text-xs font-semibold">
                              Single
                            </span>
                          )}
                        </span>

                        <span className="text-xs text-subtext truncate">{formatDate(track.created_at)}</span>
                        <span className="text-xs text-subtext truncate">{formatDate(track.updated_at)}</span>

                        <span className="text-sm text-subtext tabular-nums">
                          {track.duration_seconds
                            ? `${Math.floor(track.duration_seconds / 60)}:${(track.duration_seconds % 60).toString().padStart(2, '0')}`
                            : '—'}
                        </span>


                        <div className="flex items-center gap-1 justify-end">
                          {/* Play Track Button */}
                          <button
                            onClick={(e) => handlePlayTrack(track, displayedTracks, e)}
                            className="p-2 rounded-lg text-spotify-green hover:bg-spotify-green/20 transition-colors"
                            title="Play Track"
                          >
                            <Play size={14} fill="currentColor" />
                          </button>

                          {/* Edit Track */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingTrack(track)
                              setTrackModalOpen(true)
                            }}
                            className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                            title="Edit Track & Change Album"
                          >
                            <Pencil size={14} />
                          </button>

                          {/* Upload Cover */}
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${
                              uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
                            }`}
                            title="Upload Track Photo"
                          >
                            <ImageIcon size={14} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  openImageCropper(file, (croppedFile) => handleUploadTrackCover(track.id, croppedFile))
                                }
                                e.target.value = ''
                              }}
                            />
                          </label>

                          {/* Upload Audio */}
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${
                              uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
                            }`}
                            title="Upload Audio File"
                          >
                            <Upload size={14} />
                            <input
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleUploadAudio(track.id, file)
                                e.target.value = ''
                              }}
                            />
                          </label>

                          {/* Remove from Album if part of album */}
                          {track.album_id && (
                            <button
                              onClick={(e) => handleRemoveTrackFromAlbum(track.id, e)}
                              className="p-2 rounded-lg text-subtext hover:text-amber-400 hover:bg-surface-highlight transition-colors"
                              title="Remove from Album (Convert to Single)"
                            >
                              <FolderMinus size={14} />
                            </button>
                          )}

                          {/* Delete Track */}
                          <button
                            onClick={(e) => handleTrackDelete(track.id, e)}
                            className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                            title="Delete Track"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}

          {/* ALBUMS TABLE WITH ACCORDION & SERIAL ID */}
          {activeTab === 'albums' && (
            <>
              <div className="grid grid-cols-[40px_1fr_90px_110px_110px_180px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Album Title</span>
                <span>Tracks</span>
                <span>Created</span>
                <span>Updated</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {displayedAlbums.length === 0 ? (
                  <div className="py-16 text-center text-subtext text-sm">
                    {searchQ ? 'No matching albums found' : 'You haven’t created any albums yet'}
                  </div>
                ) : (
                  displayedAlbums.map((al, index) => {
                    const albumTracks = myTracks.filter((t) => Number(t.album_id) === Number(al.id))
                    const isExpanded = expandedAlbumIds.has(al.id)

                    return (
                      <div key={al.id} className="flex flex-col">
                        {/* Album Row */}
                        <div
                          onClick={(e) => toggleAlbumExpand(al.id, e)}
                          className={`grid grid-cols-[40px_1fr_90px_110px_110px_180px] gap-4 items-center px-4 py-3 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-surface-highlight/40' : 'hover:bg-surface-highlight/20'
                          }`}
                        >
                          {/* Serial ID */}
                          <span className="text-xs font-semibold text-subtext tabular-nums">
                            {index + 1}
                          </span>

                          <div className="flex items-center gap-3 min-w-0">
                            {/* Expand / Collapse Chevron */}
                            <button
                              onClick={(e) => toggleAlbumExpand(al.id, e)}
                              className="text-subtext hover:text-primary transition-colors p-1"
                              title={isExpanded ? 'Collapse Album' : 'Expand Album Tracks'}
                            >
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </button>

                            {al.cover_url ? (
                              <img
                                src={al.cover_url}
                                alt={al.title}
                                className="w-10 h-10 rounded-md object-cover shrink-0 shadow"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                                <Disc size={18} className="text-subtext/50" />
                              </div>
                            )}
                            <span className="text-sm font-medium truncate">{al.title}</span>
                          </div>

                          <span className="text-sm text-subtext tabular-nums">
                            {albumTracks.length} track{albumTracks.length === 1 ? '' : 's'}
                          </span>

                          <span className="text-xs text-subtext truncate">{formatDate(al.created_at)}</span>
                          <span className="text-xs text-subtext truncate">{formatDate(al.updated_at)}</span>


                          <div className="flex items-center gap-1 justify-end">
                            {/* Play Entire Album Button */}
                            <button
                              onClick={(e) => handlePlayAlbum(al, e)}
                              className="p-2 rounded-lg text-spotify-green hover:bg-spotify-green/20 transition-colors"
                              title="Play Entire Album"
                            >
                              <Play size={15} fill="currentColor" />
                            </button>

                            {/* Edit Album */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openAlbumModal(al)
                              }}
                              className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                              title="Edit Album"
                            >
                              <Pencil size={14} />
                            </button>

                            {/* Upload Album Cover */}
                            <label
                              onClick={(e) => e.stopPropagation()}
                              className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${
                                uploadingForId === al.id ? 'opacity-50 pointer-events-none' : ''
                              }`}
                              title="Upload Album Cover"
                            >
                              <ImageIcon size={14} />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    openImageCropper(file, (croppedFile) => handleUploadAlbumCover(al.id, croppedFile))
                                  }
                                  e.target.value = ''
                                }}
                              />
                            </label>

                            {/* Delete Album */}
                            <button
                              onClick={(e) => handleAlbumDelete(al.id, e)}
                              className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                              title="Delete Album"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Album Tracks Accordion Section */}
                        {isExpanded && (
                          <div className="bg-surface-highlight/10 border-t border-b border-surface-highlight/30 px-6 py-3 space-y-2">
                            <div className="flex items-center justify-between pb-2 border-b border-surface-highlight/20 text-xs font-semibold text-subtext uppercase tracking-wider">
                              <span>Tracks in "{al.title}"</span>
                              <span>{albumTracks.length} tracks</span>
                            </div>

                            {albumTracks.length === 0 ? (
                              <div className="py-6 text-center text-xs text-subtext">
                                No tracks in this album yet. Click "+ Upload Track" to add one!
                              </div>
                            ) : (
                              <div className="divide-y divide-surface-highlight/20">
                                {[...albumTracks]
                                  .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
                                  .map((track, i) => {
                                    const isActiveTrack = currentTrack?.id === track.id && isPlaying
                                    return (
                                      <div
                                        key={track.id}
                                        onClick={() => handlePlayTrack(track, albumTracks)}

                                      className={`grid grid-cols-[30px_1fr_130px_80px_180px] gap-3 items-center py-2 px-3 rounded-lg cursor-pointer transition-colors ${
                                        isActiveTrack
                                          ? 'bg-spotify-green/15 text-spotify-green font-semibold'
                                          : 'hover:bg-surface-highlight/30 text-primary'
                                      }`}
                                    >
                                      {/* Track Serial # */}
                                      <span className="text-xs text-subtext tabular-nums text-center">
                                        {i + 1}
                                      </span>

                                      {/* Track Details */}
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {track.cover_url || al.cover_url ? (
                                          <img
                                            src={track.cover_url || al.cover_url || ''}
                                            alt={track.title}
                                            className="w-7 h-7 rounded object-cover shrink-0 shadow"
                                          />
                                        ) : (
                                          <div className="w-7 h-7 rounded bg-surface-highlight flex items-center justify-center shrink-0">
                                            <Music size={14} className="text-subtext/50" />
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium truncate">{track.title}</p>
                                          {track.audio_url ? (
                                            <span className="text-[9px] text-spotify-green">Audio attached</span>
                                          ) : (
                                            <span className="text-[9px] text-subtext">No audio</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Added to Album Date */}
                                      <span className="text-[11px] text-subtext truncate">
                                        Added: {formatDate(track.updated_at || track.created_at)}
                                      </span>


                                      {/* Duration */}
                                      <span className="text-xs text-subtext tabular-nums">
                                        {track.duration_seconds
                                          ? `${Math.floor(track.duration_seconds / 60)}:${(track.duration_seconds % 60).toString().padStart(2, '0')}`
                                          : '—'}
                                      </span>

                                      {/* Track Actions */}
                                      <div className="flex items-center gap-1 justify-end">
                                        {/* Play Track */}
                                        <button
                                          onClick={(e) => handlePlayTrack(track, albumTracks, e)}
                                          className="p-1.5 rounded-md text-spotify-green hover:bg-spotify-green/20 transition-colors"
                                          title="Play Track"
                                        >
                                          <Play size={13} fill="currentColor" />
                                        </button>

                                        {/* Edit Track */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setEditingTrack(track)
                                            setTrackModalOpen(true)
                                          }}
                                          className="p-1.5 rounded-md text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                                          title="Edit Track Details"
                                        >
                                          <Pencil size={13} />
                                        </button>

                                        {/* Upload Cover */}
                                        <label
                                          onClick={(e) => e.stopPropagation()}
                                          className={`p-1.5 rounded-md text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${
                                            uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
                                          }`}
                                          title="Upload Cover Image"
                                        >
                                          <ImageIcon size={13} />
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0]
                                              if (file) {
                                                openImageCropper(file, (croppedFile) => handleUploadTrackCover(track.id, croppedFile))
                                              }
                                              e.target.value = ''
                                            }}
                                          />
                                        </label>

                                        {/* Upload Audio */}
                                        <label
                                          onClick={(e) => e.stopPropagation()}
                                          className={`p-1.5 rounded-md text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${
                                            uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
                                          }`}
                                          title="Upload Audio File"
                                        >
                                          <Upload size={13} />
                                          <input
                                            type="file"
                                            accept="audio/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0]
                                              if (file) handleUploadAudio(track.id, file)
                                              e.target.value = ''
                                            }}
                                          />
                                        </label>

                                        {/* Remove from Album (Convert to Single) */}
                                        <button
                                          onClick={(e) => handleRemoveTrackFromAlbum(track.id, e)}
                                          className="p-1.5 rounded-md text-subtext hover:text-amber-400 hover:bg-surface-highlight transition-colors"
                                          title="Remove from Album (Convert to Single)"
                                        >
                                          <FolderMinus size={13} />
                                        </button>

                                        {/* Delete Track */}
                                        <button
                                          onClick={(e) => handleTrackDelete(track.id, e)}
                                          className="p-1.5 rounded-md text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                                          title="Delete Track"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TRACK FORM MODAL */}
      <TrackFormModal
        isOpen={trackModalOpen}
        onClose={() => {
          setTrackModalOpen(false)
          setEditingTrack(null)
        }}
        onSubmit={handleTrackSubmit}
        initialData={editingTrack}
        availableAlbums={myAlbums}
      />

      {/* ALBUM FORM MODAL */}
      {albumModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleAlbumSubmit}
            className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left"
          >
            <h2 className="text-lg font-bold">
              {editingAlbum ? 'Edit Album' : 'Create New Album'}
            </h2>

            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Album Title</label>
              <input
                type="text"
                required
                value={albumFormTitle}
                onChange={(e) => setAlbumFormTitle(e.target.value)}
                placeholder="e.g. Midnight Waves"
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Artist Profile</label>
              <div className="w-full px-3 py-2 rounded-lg bg-surface-highlight/50 text-sm text-spotify-green font-semibold border border-surface-highlight flex items-center justify-between">
                <span>{myArtist?.name || currentUser?.username}</span>
                <span className="text-[10px] text-subtext uppercase">Auto-assigned</span>
              </div>
            </div>

            {/* Cover Image Picker */}
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">
                Album Cover Photo (Optional)
              </label>
              <div
                onClick={() => albumCoverInputRef.current?.click()}
                className="relative aspect-square w-full max-h-64 mx-auto rounded-xl border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden group bg-surface-highlight/20 shadow-md"
              >
                {albumCoverPreview ? (
                  <>
                    <img
                      src={albumCoverPreview}
                      alt="Cover Preview"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-medium gap-1.5 p-4 text-center backdrop-blur-[2px]">
                      <ImageIcon size={24} />
                      <span>Click to change cover photo</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-subtext group-hover:text-primary transition-colors p-4 text-center">
                    <ImageIcon size={32} />
                    <span className="text-xs font-medium">Click to select cover image</span>
                    <span className="text-[10px] text-subtext/70">Square PNG or JPG recommended</span>
                  </div>
                )}
                <input
                  ref={albumCoverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      openImageCropper(file, (croppedFile) => {
                        setAlbumCoverFile(croppedFile)
                        setAlbumCoverPreview(URL.createObjectURL(croppedFile))
                      })
                    }
                    e.target.value = ''
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAlbumModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm font-medium hover:bg-surface-highlight transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors"
              >
                {editingAlbum ? 'Save Album' : 'Create Album'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Image Cropper Modal */}
      <ImageCropperModal
        isOpen={cropperOpen}
        imageFile={cropperFile}
        onClose={() => {
          setCropperOpen(false)
          setCropperFile(null)
        }}
        onCropComplete={(croppedFile) => {
          if (cropCallback) cropCallback(croppedFile)
          setCropperOpen(false)
          setCropperFile(null)
        }}
      />
    </div>
  )
}

