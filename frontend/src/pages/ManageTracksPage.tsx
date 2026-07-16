import { useEffect, useState, useRef } from 'react'
import { Plus, Pencil, Trash2, Upload, Search, User, Music, Disc, Radio } from 'lucide-react'
import { listTracks, createTrack, updateTrack, deleteTrack, uploadTrackAudio } from '@/api/tracks'
import { listUsers, createUser, updateUser, deleteUser } from '@/api/admin'
import { listArtists, createArtist, updateArtist, deleteArtist } from '@/api/artists'
import { listAlbums, createAlbum, updateAlbum, deleteAlbum } from '@/api/albums'
import type { Track, User as UserType, Artist, Album } from '@/types'
import TrackFormModal from '@/components/TrackFormModal'

type TabType = 'users' | 'artists' | 'albums' | 'tracks'

export default function ManageTracksPage() {
  const [activeTab, setActiveTab] = useState<TabType>('tracks')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)

  // Data states
  const [tracks, setTracks] = useState<Track[]>([])
  const [users, setUsers] = useState<UserType[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [albums, setAlbums] = useState<Album[]>([])

  // Modal control states
  const [trackModalOpen, setTrackModalOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)

  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserType | null>(null)
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', role: 'user' })

  const [artistModalOpen, setArtistModalOpen] = useState(false)
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null)
  const [artistForm, setArtistForm] = useState({ name: '', user_id: '' })

  const [albumModalOpen, setAlbumModalOpen] = useState(false)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [albumForm, setAlbumForm] = useState({ title: '', artist_id: '' })

  // Audio upload state
  const [uploadingForId, setUploadingForId] = useState<number | null>(null)

  // Searchable artist select states for album modal
  const [allArtistsList, setAllArtistsList] = useState<Artist[]>([])
  const [artistSelectSearch, setArtistSelectSearch] = useState('')
  const [showArtistSelectDropdown, setShowArtistSelectDropdown] = useState(false)
  const artistDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (albumModalOpen) {
      listArtists(0, 200)
        .then(setAllArtistsList)
        .catch(console.error)
    }
  }, [albumModalOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(event.target as Node)) {
        setShowArtistSelectDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'tracks') {
        const data = await listTracks(0, 100, searchQ || undefined)
        setTracks(data)
      } else if (activeTab === 'users') {
        const data = await listUsers(0, 100)
        setUsers(data.filter(u =>
          u.username.toLowerCase().includes(searchQ.toLowerCase()) ||
          u.email.toLowerCase().includes(searchQ.toLowerCase())
        ))
      } else if (activeTab === 'artists') {
        const data = await listArtists(0, 100)
        setArtists(data.filter(a => a.name.toLowerCase().includes(searchQ.toLowerCase())))
      } else if (activeTab === 'albums') {
        const data = await listAlbums(0, 100)
        setAlbums(data.filter(a => a.title.toLowerCase().includes(searchQ.toLowerCase())))
      }
    } catch (err) {
      console.error('Failed to load admin data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeTab, searchQ])

  // Track CRUD Actions
  const handleTrackSubmit = async (data: {
    title: string
    album_id: number
    duration_seconds?: number
    audioFile?: File
  }) => {
    try {
      if (editingTrack) {
        await updateTrack(editingTrack.id, {
          title: data.title,
          album_id: data.album_id,
          duration_seconds: data.duration_seconds
        })
        if (data.audioFile) {
          setUploadingForId(editingTrack.id)
          await uploadTrackAudio(editingTrack.id, data.audioFile)
        }
      } else {
        const newTrack = await createTrack(data.title, data.album_id, data.duration_seconds)
        if (data.audioFile) {
          setUploadingForId(newTrack.id)
          await uploadTrackAudio(newTrack.id, data.audioFile)
        }
      }
      setTrackModalOpen(false)
      setEditingTrack(null)
      loadData()
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
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete track')
    }
  }

  const handleUploadAudio = async (trackId: number, file: File) => {
    setUploadingForId(trackId)
    try {
      await uploadTrackAudio(trackId, file)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to upload audio')
    } finally {
      setUploadingForId(null)
    }
  }

  // User CRUD Actions
  const openUserModal = (user: UserType | null = null) => {
    setEditingUser(user)
    if (user) {
      setUserForm({ username: user.username, email: user.email, password: '', role: user.role || 'user' })
    } else {
      setUserForm({ username: '', email: '', password: '', role: 'user' })
    }
    setUserModalOpen(true)
  }

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          username: userForm.username,
          email: userForm.email,
          role: userForm.role
        })
      } else {
        if (!userForm.password) {
          alert('Password is required for new users')
          return
        }
        await createUser(userForm)
      }
      setUserModalOpen(false)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to save user')
    }
  }

  const handleUserDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    try {
      await deleteUser(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete user')
    }
  }

  // Artist CRUD Actions
  const openArtistModal = (artist: Artist | null = null) => {
    setEditingArtist(artist)
    if (artist) {
      setArtistForm({ name: artist.name, user_id: artist.user_id ? String(artist.user_id) : '' })
    } else {
      setArtistForm({ name: '', user_id: '' })
    }
    setArtistModalOpen(true)
  }

  const handleArtistSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name: artistForm.name,
      user_id: artistForm.user_id ? Number(artistForm.user_id) : null
    }
    try {
      if (editingArtist) {
        await updateArtist(editingArtist.id, payload)
      } else {
        await createArtist(payload)
      }
      setArtistModalOpen(false)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to save artist')
    }
  }

  const handleArtistDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this artist?')) return
    try {
      await deleteArtist(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete artist')
    }
  }

  // Album CRUD Actions
  const openAlbumModal = (album: Album | null = null) => {
    setEditingAlbum(album)
    if (album) {
      setAlbumForm({ title: album.title, artist_id: String(album.artist_id) })
    } else {
      setAlbumForm({ title: '', artist_id: '' })
    }
    setAlbumModalOpen(true)
  }

  const handleAlbumSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      title: albumForm.title,
      artist_id: Number(albumForm.artist_id)
    }
    try {
      if (editingAlbum) {
        await updateAlbum(editingAlbum.id, payload)
      } else {
        await createAlbum(payload)
      }
      setAlbumModalOpen(false)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to save album')
    }
  }

  const handleAlbumDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this album?')) return
    try {
      await deleteAlbum(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete album')
    }
  }

  return (
    <div>
      {/* Title Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Control Panel</h1>
          <p className="text-sm text-subtext mt-1">Manage platform users, artists, discographies, and uploads</p>
        </div>

        {/* Global Tab Add Button */}
        {activeTab === 'tracks' && (
          <button
            onClick={() => { setEditingTrack(null); setTrackModalOpen(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02]"
          >
            <Plus size={16} />
            Add Track
          </button>
        )}
        {activeTab === 'users' && (
          <button
            onClick={() => openUserModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02]"
          >
            <Plus size={16} />
            Add User
          </button>
        )}
        {activeTab === 'artists' && (
          <button
            onClick={() => openArtistModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02]"
          >
            <Plus size={16} />
            Add Artist
          </button>
        )}
        {activeTab === 'albums' && (
          <button
            onClick={() => openAlbumModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02]"
          >
            <Plus size={16} />
            Add Album
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-highlight mb-6 gap-2">
        <button
          onClick={() => { setActiveTab('tracks'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'tracks' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Music size={16} />
          Tracks
        </button>
        <button
          onClick={() => { setActiveTab('users'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'users' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <User size={16} />
          Users
        </button>
        <button
          onClick={() => { setActiveTab('artists'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'artists' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Radio size={16} />
          Artists
        </button>
        <button
          onClick={() => { setActiveTab('albums'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'albums' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Disc size={16} />
          Albums
        </button>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
        <input
          type="text"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={`Search ${activeTab}...`}
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-primary/20 transition-colors placeholder:text-subtext/50"
        />
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-surface-highlight overflow-hidden bg-surface-elevated/40">
          {/* TRACKS TABLE */}
          {activeTab === 'tracks' && (
            <>
              <div className="grid grid-cols-[60px_1fr_120px_120px_140px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>ID</span>
                <span>Title</span>
                <span>Album ID</span>
                <span>Duration</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {tracks.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No tracks found</div>
                ) : (
                  tracks.map((track) => (
                    <div key={track.id} className="grid grid-cols-[60px_1fr_120px_120px_140px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-semibold text-subtext tabular-nums">{track.id}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{track.title}</p>
                        {track.audio_url && <span className="text-[10px] text-spotify-green">Audio attached</span>}
                      </div>
                      <span className="text-sm text-subtext">{track.album_id}</span>
                      <span className="text-sm text-subtext tabular-nums">
                        {track.duration_seconds
                          ? `${Math.floor(track.duration_seconds / 60)}:${(track.duration_seconds % 60).toString().padStart(2, '0')}`
                          : '—'}
                      </span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => { setEditingTrack(track); setTrackModalOpen(true) }}
                          className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <label
                          className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
                            }`}
                          title="Upload audio"
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
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* USERS TABLE */}
          {activeTab === 'users' && (
            <>
              <div className="grid grid-cols-[1fr_1.5fr_100px_120px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Username</span>
                <span>Email</span>
                <span>Role</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {users.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No users found</div>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="grid grid-cols-[1fr_1.5fr_100px_120px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-medium truncate">{u.username}</span>
                      <span className="text-sm text-subtext truncate">{u.email}</span>
                      <span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${u.role === 'admin' ? 'bg-red-500/10 text-red-400' :
                          u.role === 'artist' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
                          }`}>
                          {u.role}
                        </span>
                      </span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openUserModal(u)}
                          className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleUserDelete(u.id)}
                          className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* ARTISTS TABLE */}
          {activeTab === 'artists' && (
            <>
              <div className="grid grid-cols-[1fr_150px_120px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Artist Name</span>
                <span>User ID</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {artists.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No artists found</div>
                ) : (
                  artists.map((a) => (
                    <div key={a.id} className="grid grid-cols-[1fr_150px_120px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <span className="text-sm text-subtext">{a.user_id || 'Not linked'}</span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openArtistModal(a)}
                          className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleArtistDelete(a.id)}
                          className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* ALBUMS TABLE */}
          {activeTab === 'albums' && (
            <>
              <div className="grid grid-cols-[1fr_150px_120px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Album Title</span>
                <span>Artist ID</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {albums.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No albums found</div>
                ) : (
                  albums.map((al) => (
                    <div key={al.id} className="grid grid-cols-[1fr_150px_120px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-medium truncate">{al.title}</span>
                      <span className="text-sm text-subtext">{al.artist_id}</span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openAlbumModal(al)}
                          className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleAlbumDelete(al.id)}
                          className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TRACK FORM MODAL */}
      <TrackFormModal
        isOpen={trackModalOpen}
        onClose={() => { setTrackModalOpen(false); setEditingTrack(null) }}
        onSubmit={handleTrackSubmit}
        initialData={editingTrack}
      />

      {/* USER FORM MODAL */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleUserSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4">
            <h2 className="text-lg font-bold">{editingUser ? 'Edit User' : 'Create User'}</h2>
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Username</label>
              <input
                type="text"
                required
                value={userForm.username}
                onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Email</label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>
            {!editingUser && (
              <div>
                <label className="block text-sm font-medium text-subtext mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={userForm.password}
                  onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Role</label>
              <select
                value={userForm.role}
                onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors bg-surface-highlight"
              >
                <option value="user">User</option>
                <option value="artist">Artist</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm hover:bg-surface-highlight transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ARTIST FORM MODAL */}
      {artistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleArtistSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4">
            <h2 className="text-lg font-bold">{editingArtist ? 'Edit Artist' : 'Create Artist'}</h2>
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Artist Name</label>
              <input
                type="text"
                required
                value={artistForm.name}
                onChange={e => setArtistForm({ ...artistForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Linked User ID (Optional)</label>
              <input
                type="number"
                value={artistForm.user_id}
                onChange={e => setArtistForm({ ...artistForm, user_id: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
                placeholder="User ID or empty"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setArtistModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm hover:bg-surface-highlight transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ALBUM FORM MODAL */}
      {albumModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAlbumSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4">
            <h2 className="text-lg font-bold">{editingAlbum ? 'Edit Album' : 'Create Album'}</h2>
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Album Title</label>
              <input
                type="text"
                required
                value={albumForm.title}
                onChange={e => setAlbumForm({ ...albumForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>
            {/* Searchable Artist Dropdown */}
            <div className="relative font-sans text-left" ref={artistDropdownRef}>
              <label className="block text-sm font-medium text-subtext mb-1">Artist</label>
              <div
                onClick={() => setShowArtistSelectDropdown(!showArtistSelectDropdown)}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary cursor-pointer border-2 border-transparent hover:border-spotify-green/50 flex justify-between items-center transition-colors"
              >
                <span className="truncate">
                  {albumForm.artist_id
                    ? allArtistsList.find((a) => a.id === Number(albumForm.artist_id))?.name || `Artist ID: ${albumForm.artist_id}`
                    : 'Select Artist...'}
                </span>
                <span className="text-xs text-subtext select-none">▼</span>
              </div>

              {showArtistSelectDropdown && (
                <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl z-50 p-2 space-y-2 max-h-60 overflow-hidden flex flex-col">
                  <input
                    type="text"
                    placeholder="Search artist..."
                    value={artistSelectSearch}
                    onChange={(e) => setArtistSelectSearch(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md bg-surface-highlight text-xs text-primary outline-none border border-transparent focus:border-spotify-green/30"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
                    {allArtistsList
                      .filter((a) =>
                        a.name.toLowerCase().includes(artistSelectSearch.toLowerCase())
                      )
                      .map((a) => (
                        <div
                          key={a.id}
                          onClick={() => {
                            setAlbumForm({ ...albumForm, artist_id: String(a.id) })
                            setShowArtistSelectDropdown(false)
                            setArtistSelectSearch('')
                          }}
                          className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-primary flex justify-between items-center"
                        >
                          <span className="truncate mr-2">{a.name}</span>
                          <span className="text-[10px] text-subtext shrink-0">ID: {a.id}</span>
                        </div>
                      ))}
                    {allArtistsList.filter((a) =>
                      a.name.toLowerCase().includes(artistSelectSearch.toLowerCase())
                    ).length === 0 && (
                        <div className="px-3 py-2 text-xs text-subtext text-center">
                          No matches found
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAlbumModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm hover:bg-surface-highlight transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
