import { useEffect, useState, useRef } from 'react'
import { Plus, Pencil, Trash2, Upload, Search, Music, Disc, Image as ImageIcon, Sparkles } from 'lucide-react'
import { listTracks, createTrack, updateTrack, deleteTrack, uploadTrackAudio, uploadTrackCover } from '@/api/tracks'
import { listArtists, createArtist, getArtistSingles } from '@/api/artists'
import { listAlbums, createAlbum, updateAlbum, deleteAlbum, uploadAlbumCover, getAlbumTracks } from '@/api/albums'
import type { Track, Artist, Album } from '@/types'
import { useAuthStore } from '@/store/authStore'
import TrackFormModal from '@/components/TrackFormModal'

type TabType = 'tracks' | 'albums'

export default function ArtistPanelPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<TabType>('tracks')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)

  // Artist profile state
  const [myArtist, setMyArtist] = useState<Artist | null>(null)
  const [profileCreating, setProfileCreating] = useState(false)

  // Data states
  const [myAlbums, setMyAlbums] = useState<Album[]>([])
  const [myTracks, setMyTracks] = useState<Track[]>([])

  // Modal control states
  const [trackModalOpen, setTrackModalOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)

  const [albumModalOpen, setAlbumModalOpen] = useState(false)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [albumFormTitle, setAlbumFormTitle] = useState('')
  const [albumCoverFile, setAlbumCoverFile] = useState<File | null>(null)
  const [albumCoverPreview, setAlbumCoverPreview] = useState<string | null>(null)
  const albumCoverInputRef = useRef<HTMLInputElement>(null)

  // Upload state tracking
  const [uploadingForId, setUploadingForId] = useState<number | null>(null)

  // Load Artist Profile & Data
  const loadArtistData = async () => {
    if (!currentUser) return
    setLoading(true)
    try {
      // 1. Fetch artist profile linked to current user
      const allArtists = await listArtists(0, 200)
      let profile = allArtists.find(
        (a) => Number(a.user_id) === Number(currentUser.id) || Number(a.id) === Number(currentUser.id)
      )

      if (!profile) {
        // Attempt to auto-create profile if missing
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
        // A. Fetch tracks from each album owned by the artist
        const albumTracksPromises = filteredAlbums.map((al) =>
          getAlbumTracks(al.id, 0, 100).catch(() => [] as Track[]),
        )
        // B. Fetch standalone single tracks for this artist
        const singlesPromise = getArtistSingles(profile.id, 0, 100).catch(() => [] as Track[])
        // C. Fetch global tracks list as safety net
        const allTracksPromise = listTracks(0, 200).catch(() => [] as Track[])

        const [albumTrackGroups, singles, allTracks] = await Promise.all([
          Promise.all(albumTracksPromises),
          singlesPromise,
          allTracksPromise,
        ])

        const myAlbumIds = new Set(filteredAlbums.map((al) => Number(al.id)))
        const trackMap = new Map<number, Track>()

        // Add album tracks
        albumTrackGroups.flat().forEach((t) => trackMap.set(t.id, t))

        // Add singles
        singles.forEach((t) => trackMap.set(t.id, t))

        // Add any matching tracks from global list
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

  const handleTrackDelete = async (id: number) => {
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

  // Album CRUD Actions (Automatic artist_id assignment)
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
      artist_id: myArtist.id, // Automatically set to logged in artist
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

  const handleAlbumDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this album and all its tracks?')) return
    try {
      await deleteAlbum(id)
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete album')
    }
  }

  // Search filtering
  const displayedTracks = myTracks.filter((t) =>
    t.title.toLowerCase().includes(searchQ.toLowerCase()),
  )

  const displayedAlbums = myAlbums.filter((al) =>
    al.title.toLowerCase().includes(searchQ.toLowerCase()),
  )

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
              if (myAlbums.length === 0) {
                alert('Please create at least one album before adding tracks!')
                openAlbumModal()
                return
              }
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
              <div className="grid grid-cols-[60px_1fr_160px_100px_160px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>ID</span>
                <span>Title</span>
                <span>Album</span>
                <span>Duration</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {displayedTracks.length === 0 ? (
                  <div className="py-16 text-center text-subtext text-sm">
                    {searchQ ? 'No matching tracks found' : 'You haven’t uploaded any tracks yet'}
                  </div>
                ) : (
                  displayedTracks.map((track) => {
                    const album = myAlbums.find((a) => a.id === track.album_id)
                    return (
                      <div
                        key={track.id}
                        className="grid grid-cols-[60px_1fr_160px_100px_160px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors"
                      >
                        <span className="text-sm font-semibold text-subtext tabular-nums">
                          {track.id}
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
                            {track.audio_url && (
                              <span className="text-[10px] text-spotify-green">Audio attached</span>
                            )}
                          </div>
                        </div>

                        <span className="text-sm truncate">
                          {track.album_id ? (
                            <span className="text-subtext">{album?.title || `Album #${track.album_id}`}</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green text-xs font-semibold">
                              Single
                            </span>
                          )}
                        </span>


                        <span className="text-sm text-subtext tabular-nums">
                          {track.duration_seconds
                            ? `${Math.floor(track.duration_seconds / 60)}:${(track.duration_seconds % 60).toString().padStart(2, '0')}`
                            : '—'}
                        </span>

                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => {
                              setEditingTrack(track)
                              setTrackModalOpen(true)
                            }}
                            className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                            title="Edit Track"
                          >
                            <Pencil size={14} />
                          </button>
                          <label
                            className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''}`}
                            title="Upload Cover Image"
                          >
                            <ImageIcon size={14} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleUploadTrackCover(track.id, file)
                                e.target.value = ''
                              }}
                            />
                          </label>
                          <label
                            className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''}`}
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
                          <button
                            onClick={() => handleTrackDelete(track.id)}
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

          {/* ALBUMS TABLE */}
          {activeTab === 'albums' && (
            <>
              <div className="grid grid-cols-[1fr_120px_160px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Album Title</span>
                <span>Track Count</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {displayedAlbums.length === 0 ? (
                  <div className="py-16 text-center text-subtext text-sm">
                    {searchQ ? 'No matching albums found' : 'You haven’t created any albums yet'}
                  </div>
                ) : (
                  displayedAlbums.map((al) => {
                    const trackCount = myTracks.filter((t) => t.album_id === al.id).length
                    return (
                      <div
                        key={al.id}
                        className="grid grid-cols-[1fr_120px_160px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
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
                          {trackCount} track{trackCount === 1 ? '' : 's'}
                        </span>

                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openAlbumModal(al)}
                            className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                            title="Edit Album"
                          >
                            <Pencil size={14} />
                          </button>
                          <label
                            className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === al.id ? 'opacity-50 pointer-events-none' : ''}`}
                            title="Upload Album Cover"
                          >
                            <ImageIcon size={14} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleUploadAlbumCover(al.id, file)
                                e.target.value = ''
                              }}
                            />
                          </label>
                          <button
                            onClick={() => handleAlbumDelete(al.id)}
                            className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                            title="Delete Album"
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
        </div>
      )}

      {/* TRACK FORM MODAL (Restricted to artist's own albums) */}
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

      {/* ALBUM FORM MODAL (Automatic Artist Binding) */}
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
                className="relative h-32 rounded-lg border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden group bg-surface-highlight/20"
              >
                {albumCoverPreview ? (
                  <>
                    <img
                      src={albumCoverPreview}
                      alt="Cover Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-medium gap-1">
                      <ImageIcon size={20} />
                      <span>Change cover image</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-subtext group-hover:text-primary transition-colors">
                    <ImageIcon size={24} />
                    <span className="text-xs font-medium">Click to select cover image</span>
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
                      setAlbumCoverFile(file)
                      setAlbumCoverPreview(URL.createObjectURL(file))
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAlbumModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-subtext hover:text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadingForId !== null}
                className="px-4 py-2 rounded-lg bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors shadow-lg disabled:opacity-50"
              >
                {uploadingForId !== null
                  ? 'Uploading...'
                  : editingAlbum
                    ? 'Save Changes'
                    : 'Create Album'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
