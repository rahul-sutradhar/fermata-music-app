import { useEffect, useState, useRef } from 'react'
import { Plus, Pencil, Trash2, Upload, Search, User, Music, Disc, Radio, Shield, Image as ImageIcon } from 'lucide-react'
import { listTracks, createTrack, updateTrack, deleteTrack, uploadTrackAudio, uploadTrackCover } from '@/api/tracks'
import { listUsers, createUser, updateUser, deleteUser } from '@/api/admin'
import { listArtists, createArtist, updateArtist, deleteArtist } from '@/api/artists'
import { listAlbums, createAlbum, updateAlbum, deleteAlbum, uploadAlbumCover } from '@/api/albums'
import type { Track, User as UserType, Artist, Album } from '@/types'
import { useAuthStore } from '@/store/authStore'
import TrackFormModal from '@/components/TrackFormModal'


type TabType = 'users' | 'artists' | 'admins' | 'albums' | 'tracks'

export default function AdminPanelPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<TabType>('tracks')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)

  // Data states
  const [tracks, setTracks] = useState<Track[]>([])
  const [users, setUsers] = useState<UserType[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [userMap, setUserMap] = useState<Record<number, string>>({})

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
  const [albumCoverFile, setAlbumCoverFile] = useState<File | null>(null)
  const [albumCoverPreview, setAlbumCoverPreview] = useState<string | null>(null)
  const albumCoverInputRef = useRef<HTMLInputElement>(null)

  // Audio / Cover upload state
  const [uploadingForId, setUploadingForId] = useState<number | null>(null)

  // Searchable artist select states for album modal
  const [allArtistsList, setAllArtistsList] = useState<Artist[]>([])
  const [artistSelectSearch, setArtistSelectSearch] = useState('')
  const [showArtistSelectDropdown, setShowArtistSelectDropdown] = useState(false)
  const artistDropdownRef = useRef<HTMLDivElement>(null)

  // Searchable artist account select states for artist profile modal
  const [artistAccountsList, setArtistAccountsList] = useState<UserType[]>([])
  const [artistAccountSearch, setArtistAccountSearch] = useState('')
  const [showArtistAccountDropdown, setShowArtistAccountDropdown] = useState(false)
  const artistAccountDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (albumModalOpen) {
      listArtists(0, 200)
        .then(setAllArtistsList)
        .catch(console.error)
    }
  }, [albumModalOpen])

  useEffect(() => {
    if (artistModalOpen) {
      listUsers(0, 200)
        .then(data => setArtistAccountsList(data.filter(u => u.role === 'artist')))
        .catch(console.error)
    }
  }, [artistModalOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(event.target as Node)) {
        setShowArtistSelectDropdown(false)
      }
      if (artistAccountDropdownRef.current && !artistAccountDropdownRef.current.contains(event.target as Node)) {
        setShowArtistAccountDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadData = async () => {
    setLoading(true)
    let allUsers: UserType[] = []
    try {
      allUsers = await listUsers(0, 200)
      const map: Record<number, string> = {}
      allUsers.forEach(u => {
        map[u.id] = u.username
      })
      setUserMap(map)
    } catch (err) {
      console.warn('Failed to load user list for admin map:', err)
    }

    try {
      if (activeTab === 'tracks') {
        const data = await listTracks(0, 200, searchQ || undefined)
        setTracks(data)
      } else if (activeTab === 'users') {
        setUsers(allUsers.filter(u =>
          u.role === 'user' && (
            (u.username || '').toLowerCase().includes(searchQ.toLowerCase()) ||
            (u.email || '').toLowerCase().includes(searchQ.toLowerCase())
          )
        ))
      } else if (activeTab === 'admins') {
        setUsers(allUsers.filter(u =>
          u.role === 'admin' && (
            (u.username || '').toLowerCase().includes(searchQ.toLowerCase()) ||
            (u.email || '').toLowerCase().includes(searchQ.toLowerCase())
          )
        ))
      } else if (activeTab === 'artists') {
        try {
          const profileData = await listArtists(0, 200)
          setArtists(profileData.filter(a => (a.name || '').toLowerCase().includes(searchQ.toLowerCase())))
        } catch (err) {
          console.error('Failed to load artist profiles:', err)
        }
        setUsers(allUsers.filter(u =>
          u.role === 'artist' && (
            (u.username || '').toLowerCase().includes(searchQ.toLowerCase()) ||
            (u.email || '').toLowerCase().includes(searchQ.toLowerCase())
          )
        ))
        setArtistAccountsList(allUsers.filter(u => u.role === 'artist'))
      } else if (activeTab === 'albums') {
        const data = await listAlbums(0, 200)
        setAlbums(data.filter(a => a.title.toLowerCase().includes(searchQ.toLowerCase())))
        try {
          const artistData = await listArtists(0, 200)
          setAllArtistsList(artistData)
        } catch {
          // silent
        }
      }
    } catch (err) {
      console.error('Failed to load admin data tab:', err)
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
          artist_id: data.artist_id,
          duration_seconds: data.duration_seconds
        })
      } else {
        targetTrack = await createTrack(data.title, data.album_id, data.duration_seconds, data.artist_id)
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

  const handleUploadTrackCover = async (trackId: number, file: File) => {
    setUploadingForId(trackId)
    try {
      await uploadTrackCover(trackId, file)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to upload track cover')
    } finally {
      setUploadingForId(null)
    }
  }


  // User CRUD Actions
  const openUserModal = (user: UserType | null = null, defaultRole: string = 'user') => {
    setEditingUser(user)
    if (user) {
      setUserForm({ username: user.username, email: user.email, password: '', role: user.role || defaultRole })
    } else {
      setUserForm({ username: '', email: '', password: '', role: defaultRole })
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
    setAlbumCoverFile(null)
    setAlbumCoverPreview(album?.cover_url || null)
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
      loadData()
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
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to upload album cover')
    } finally {
      setUploadingForId(null)
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
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between mb-2">
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
            onClick={() => openUserModal(null, 'user')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02]"
          >
            <Plus size={16} />
            Add User
          </button>
        )}
        {activeTab === 'admins' && (
          <button
            onClick={() => openUserModal(null, 'admin')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02]"
          >
            <Plus size={16} />
            Add Admin
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
      <div className="flex border-b border-surface-highlight mb-4 gap-2">
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
          onClick={() => { setActiveTab('admins'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'admins' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Shield size={16} />
          Admins
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
      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
        <input
          type="text"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={`Search ${activeTab === 'artists' ? 'artists accounts/profiles' : activeTab}...`}
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-primary/20 transition-colors placeholder:text-subtext/50"
        />
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === 'artists' ? (
        /* ARTISTS TAB - CUSTOM DETAILED ROLE-SEPARATED DESIGN */
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* SECTION 1: ARTIST LOGIN ACCOUNTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary">Artist Accounts</h2>
                <p className="text-xs text-subtext mt-0.5">User accounts assigned the 'artist' role for platform access</p>
              </div>
              <button
                onClick={() => openUserModal(null, 'artist')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-spotify-green text-black text-xs font-semibold hover:bg-spotify-green-hover transition-colors"
              >
                <Plus size={14} />
                Add Artist Account
              </button>
            </div>
            <div className="rounded-xl border border-surface-highlight overflow-hidden bg-surface-elevated/40">
              <div className="grid grid-cols-[1fr_1.5fr_100px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Username</span>
                <span>Email</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {users.filter(u => u.role === 'artist').length === 0 ? (
                  <div className="py-8 text-center text-subtext text-sm">No artist accounts found</div>
                ) : (
                  users.filter(u => u.role === 'artist').map((u) => (
                    <div key={u.id} className="grid grid-cols-[1fr_1.5fr_100px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-medium truncate">{u.username}</span>
                      <span className="text-sm text-subtext truncate">{u.email}</span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openUserModal(u, 'artist')}
                          className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                          title="Edit Account"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleUserDelete(u.id)}
                          className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                          title="Delete Account"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: PUBLIC ARTIST PROFILES */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary">Public Artist Catalog Profiles</h2>
                <p className="text-xs text-subtext mt-0.5">Catalog representation linked to database discographies</p>
              </div>
              <button
                onClick={() => openArtistModal()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-spotify-green text-black text-xs font-semibold hover:bg-spotify-green-hover transition-colors"
              >
                <Plus size={14} />
                Add Artist Profile
              </button>
            </div>
             <div className="rounded-xl border border-surface-highlight overflow-hidden bg-surface-elevated/40">
              <div className="grid grid-cols-[1fr_220px_100px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Artist Name</span>
                <span>Linked Account</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {artists.length === 0 ? (
                  <div className="py-8 text-center text-subtext text-sm">No artist profiles found</div>
                ) : (
                  artists.map((a) => (
                    <div key={a.id} className="grid grid-cols-[1fr_220px_100px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <span className="text-sm text-subtext">
                        {a.user_id ? (userMap[a.user_id] ? `${userMap[a.user_id]} (ID: ${a.user_id})` : `ID: ${a.user_id}`) : 'Not linked'}
                      </span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openArtistModal(a)}
                          className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                          title="Edit Profile"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleArtistDelete(a.id)}
                          className="p-2 rounded-lg text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors"
                          title="Delete Profile"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* STANDARD TAB VIEWS */
        <div className="rounded-xl border border-surface-highlight overflow-hidden bg-surface-elevated/40 animate-in fade-in duration-200">
          {/* TRACKS TABLE */}
          {activeTab === 'tracks' && (
            <>
              <div className="grid grid-cols-[60px_1fr_120px_120px_160px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
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
                    <div key={track.id} className="grid grid-cols-[60px_1fr_120px_120px_160px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-semibold text-subtext tabular-nums">{track.id}</span>
                      <div className="flex items-center gap-3 min-w-0">
                        {track.cover_url ? (
                          <img src={track.cover_url} alt={track.title} className="w-10 h-10 rounded-md object-cover shrink-0 shadow" />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                            <Music size={18} className="text-subtext/50" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{track.title}</p>
                          {track.audio_url && <span className="text-[10px] text-spotify-green">Audio attached</span>}
                        </div>
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
                          className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''}`}
                          title="Upload cover photo"
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

          {/* NORMAL USERS TABLE */}
          {activeTab === 'users' && (
            <>
              <div className="grid grid-cols-[1fr_1.5fr_120px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Username</span>
                <span>Email</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {users.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No normal users found</div>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="grid grid-cols-[1fr_1.5fr_120px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-medium truncate">{u.username}</span>
                      <span className="text-sm text-subtext truncate">{u.email}</span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openUserModal(u, 'user')}
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

          {/* ADMINS TABLE */}
          {activeTab === 'admins' && (
            <>
              <div className="grid grid-cols-[1fr_1.5fr_120px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Username</span>
                <span>Email</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {users.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No administrators found</div>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="grid grid-cols-[1fr_1.5fr_120px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-sm font-medium truncate">{u.username}</span>
                      <span className="text-sm text-subtext truncate">{u.email}</span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openUserModal(u, 'admin')}
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

          {/* ALBUMS TABLE */}
          {activeTab === 'albums' && (
            <>
              <div className="grid grid-cols-[1fr_220px_160px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>Album Title</span>
                <span>Artist Profile</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {albums.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No albums found</div>
                ) : (
                  albums.map((al) => (
                    <div key={al.id} className="grid grid-cols-[1fr_220px_160px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {al.cover_url ? (
                          <img src={al.cover_url} alt={al.title} className="w-10 h-10 rounded-md object-cover shrink-0 shadow" />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                            <Disc size={18} className="text-subtext/50" />
                          </div>
                        )}
                        <span className="text-sm font-medium truncate">{al.title}</span>
                      </div>
                      <span className="text-sm text-subtext">
                        {al.artist_id ? (allArtistsList.find(a => a.id === al.artist_id)?.name ? `${allArtistsList.find(a => a.id === al.artist_id)?.name} (ID: ${al.artist_id})` : `ID: ${al.artist_id}`) : 'Unknown'}
                      </span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openAlbumModal(al)}
                          className="p-2 rounded-lg text-subtext hover:text-primary hover:bg-surface-highlight transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <label
                          className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === al.id ? 'opacity-50 pointer-events-none' : ''}`}
                          title="Upload album cover"
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
          <form onSubmit={handleUserSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left">
            <h2 className="text-lg font-bold">
              {editingUser
                ? `Edit ${userForm.role.toUpperCase()}`
                : `Create ${userForm.role.toUpperCase()}`}
            </h2>
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Username</label>
              <input
                type="text"
                required
                disabled={editingUser?.username === 'admin'}
                value={userForm.username}
                onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors ${
                  editingUser?.username === 'admin' ? 'opacity-50 cursor-not-allowed' : ''
                }`}
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
              <label className="block text-sm font-medium text-subtext mb-1">Assigned Account Role</label>
              {(() => {
                const isMasterAdmin = currentUser?.username === 'admin' || currentUser?.id === 1
                const isSelf = editingUser != null && editingUser.id === currentUser?.id
                const isMasterTarget = editingUser != null && (editingUser.username === 'admin' || editingUser.id === 1)
                const isTargetAdmin = editingUser != null && editingUser.role === 'admin'
                const canChangeRole = !isSelf && !isMasterTarget && (isMasterAdmin || !isTargetAdmin)

                return (
                  <>
                    <select
                      value={userForm.role}
                      onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                      disabled={!canChangeRole}
                      className={`w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors uppercase font-semibold ${
                        !canChangeRole ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <option value="user">USER</option>
                      <option value="artist">ARTIST</option>
                      {isMasterAdmin && <option value="admin">ADMIN</option>}
                    </select>
                    {isMasterTarget && (
                      <p className="text-xs text-amber-400 mt-1">
                        The master admin account role cannot be changed by anyone
                      </p>
                    )}
                    {isSelf && !isMasterTarget && (
                      <p className="text-xs text-amber-400 mt-1">
                        You cannot change your own role
                      </p>
                    )}
                    {!isMasterAdmin && isTargetAdmin && !isSelf && (
                      <p className="text-xs text-amber-400 mt-1">
                        Only the master admin can demote administrators
                      </p>
                    )}
                    {!isMasterAdmin && !isTargetAdmin && (
                      <p className="text-xs text-subtext mt-1">
                        Only the master admin can promote users to Administrator
                      </p>
                    )}
                  </>
                )
              })()}
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

      {/* ARTIST PROFILE FORM MODAL */}
      {artistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleArtistSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left">
            <h2 className="text-lg font-bold">{editingArtist ? 'Edit Artist Profile' : 'Create Artist Profile'}</h2>
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

            {/* Searchable Artist Account Dropdown */}
            <div className="relative font-sans text-left" ref={artistAccountDropdownRef}>
              <label className="block text-sm font-medium text-subtext mb-1">Link User Account (Optional)</label>
              <div
                onClick={() => setShowArtistAccountDropdown(!showArtistAccountDropdown)}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary cursor-pointer border-2 border-transparent hover:border-spotify-green/50 flex justify-between items-center transition-colors"
              >
                <span className="truncate">
                  {artistForm.user_id
                    ? artistAccountsList.find((u) => u.id === Number(artistForm.user_id))?.username || `User ID: ${artistForm.user_id}`
                    : 'Select Artist Account...'}
                </span>
                <span className="text-xs text-subtext select-none">▼</span>
              </div>

              {showArtistAccountDropdown && (
                <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl z-50 p-2 space-y-2 max-h-60 overflow-hidden flex flex-col">
                  <input
                    type="text"
                    placeholder="Search account..."
                    value={artistAccountSearch}
                    onChange={(e) => setArtistAccountSearch(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md bg-surface-highlight text-xs text-primary outline-none border border-transparent focus:border-spotify-green/30"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
                    <div
                      onClick={() => {
                        setArtistForm({ ...artistForm, user_id: '' })
                        setShowArtistAccountDropdown(false)
                        setArtistAccountSearch('')
                      }}
                      className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-primary flex justify-between items-center border-b border-surface-highlight/30"
                    >
                      <span className="font-semibold text-subtext">Do Not Link / Clear Selection</span>
                    </div>

                    {artistAccountsList
                      .filter((u) =>
                        (u.username || '').toLowerCase().includes(artistAccountSearch.toLowerCase()) ||
                        (u.email || '').toLowerCase().includes(artistAccountSearch.toLowerCase())
                      )
                      .map((u) => (
                        <div
                          key={u.id}
                          onClick={() => {
                            setArtistForm({ ...artistForm, user_id: String(u.id) })
                            setShowArtistAccountDropdown(false)
                            setArtistAccountSearch('')
                          }}
                          className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-primary flex justify-between items-center"
                        >
                          <span className="truncate mr-2">{u.username} ({u.email})</span>
                          <span className="text-[10px] text-subtext shrink-0">ID: {u.id}</span>
                        </div>
                      ))}
                    {artistAccountsList.filter((u) =>
                      (u.username || '').toLowerCase().includes(artistAccountSearch.toLowerCase()) ||
                      (u.email || '').toLowerCase().includes(artistAccountSearch.toLowerCase())
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
          <form onSubmit={handleAlbumSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left">
            <h2 className="text-lg font-bold">{editingAlbum ? 'Edit Album' : 'Create Album'}</h2>

            {/* Album Cover Attachment */}
            <div>
              <label className="block text-sm font-medium text-subtext mb-1.5">
                Album Cover Photo (Optional)
              </label>
              <div
                onClick={() => albumCoverInputRef.current?.click()}
                className="w-full border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-colors"
              >
                {albumCoverPreview ? (
                  <img src={albumCoverPreview} alt="Album cover preview" className="w-12 h-12 rounded-md object-cover shrink-0 shadow" />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                    <ImageIcon size={20} className="text-subtext/60" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-primary block truncate">
                    {albumCoverFile ? albumCoverFile.name : (albumCoverPreview ? 'Click to replace album cover' : 'Attach album cover image...')}
                  </span>
                  <span className="text-[10px] text-subtext block mt-0.5">
                    Recommended square PNG or JPG
                  </span>
                </div>
                <input
                  ref={albumCoverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setAlbumCoverFile(file)
                      setAlbumCoverPreview(URL.createObjectURL(file))
                    }
                  }}
                  className="hidden"
                />
              </div>
            </div>

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
                        (a.name || '').toLowerCase().includes(artistSelectSearch.toLowerCase())
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
                      (a.name || '').toLowerCase().includes(artistSelectSearch.toLowerCase())
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
