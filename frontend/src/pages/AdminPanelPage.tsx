import { useEffect, useState, useRef } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Search,
  User,
  Music,
  Disc,
  Radio,
  Shield,
  Image as ImageIcon,
  Play,
  ChevronDown,
  ChevronRight,
  FolderMinus,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import {
  listTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  uploadTrackAudio,
  uploadTrackCover,
} from '@/api/tracks'
import { listUsers, createUser, updateUser, deleteUser } from '@/api/admin'
import { listArtists, createArtist, updateArtist, deleteArtist } from '@/api/artists'
import {
  listAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  uploadAlbumCover,
} from '@/api/albums'
import type { Track, User as UserType, Artist, Album } from '@/types'
import {
  listIngestionRequests,
  approveIngestionRequest,
  rejectIngestionRequest,
  deleteIngestionRequest
} from '@/api/agenticIngest'
import type { IngestionRequestItem } from '@/api/agenticIngest'
import { useAuthStore } from '@/store/authStore'
import { usePlayerStore } from '@/store/playerStore'
import TrackFormModal from '@/components/TrackFormModal'
import ImageCropperModal from '@/components/ImageCropperModal'

type TabType = 'tracks' | 'albums' | 'users' | 'artists' | 'admins' | 'ingestion'

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

export default function AdminPanelPage() {
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

  // Data states
  const [tracks, setTracks] = useState<Track[]>([])
  const [users, setUsers] = useState<UserType[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [userMap, setUserMap] = useState<Record<number, string>>({})
  const [ingestionRequests, setIngestionRequests] = useState<IngestionRequestItem[]>([])
  const [approvingRequestId, setApprovingRequestId] = useState<number | null>(null)

  // Accordion state for albums expansion
  const [expandedAlbumIds, setExpandedAlbumIds] = useState<Set<number>>(new Set())

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

  // Cropper modal state
  const [cropperOpen, setCropperOpen] = useState(false)
  const [cropperFile, setCropperFile] = useState<File | null>(null)
  const [cropCallback, setCropCallback] = useState<((file: File) => void) | null>(null)

  const openImageCropper = (file: File, callback: (croppedFile: File) => void) => {
    setCropperFile(file)
    setCropCallback(() => callback)
    setCropperOpen(true)
  }

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

  useEffect(() => {
    if (albumModalOpen) {
      listArtists(0, 100)
        .then(setAllArtistsList)
        .catch(console.error)
    }
  }, [albumModalOpen])

  useEffect(() => {
    if (artistModalOpen) {
      listUsers(0, 100)
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

  const sortIngestionRequests = (requests: IngestionRequestItem[]): IngestionRequestItem[] => {
    const getStatusPriority = (status: string) => {
      switch (status) {
        case 'pending':
        case 'processing':
          return 1;
        case 'completed':
          return 2;
        case 'rejected':
          return 3;
        case 'failed':
          return 4;
        default:
          return 5;
      }
    }

    return [...requests].sort((a, b) => {
      const priorityA = getStatusPriority(a.status)
      const priorityB = getStatusPriority(b.status)

      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0

      // Priority 1: pending/processing - ASCENDING order by date
      if (priorityA === 1) {
        return timeA - timeB
      }

      // Priority 2, 3, 4: completed, rejected, failed - DESCENDING order by date
      return timeB - timeA
    })
  }

  const loadData = async () => {
    setLoading(true)
    let allUsers: UserType[] = []
    try {
      allUsers = await listUsers(0, 100)
      const map: Record<number, string> = {}
      allUsers.forEach(u => {
        map[u.id] = u.username
      })
      setUserMap(map)
    } catch (err) {
      console.warn('Failed to load user list for admin map:', err)
    }

    try {
      const trackSearch = activeTab === 'tracks' ? (searchQ || undefined) : undefined
      const [allTracksData, allAlbumsData, allArtistsData, allRequestsData] = await Promise.all([
        listTracks(0, 100, trackSearch).catch((err) => {
          console.error('Failed to load tracks:', err)
          return [] as Track[]
        }),
        listAlbums(0, 100).catch((err) => {
          console.error('Failed to load albums:', err)
          return [] as Album[]
        }),
        listArtists(0, 100).catch((err) => {
          console.error('Failed to load artists:', err)
          return [] as Artist[]
        }),
        listIngestionRequests().catch((err) => {
          console.error('Failed to load ingestion requests:', err)
          return [] as IngestionRequestItem[]
        }),
      ])

      // Sort platform-wide tracks and albums by ID / date descending
      const sortedTracks = [...allTracksData].sort((a, b) => b.id - a.id)
      const sortedAlbums = [...allAlbumsData].sort((a, b) => b.id - a.id)

      setTracks(sortedTracks)
      setAlbums(sortedAlbums.filter(a => a.title.toLowerCase().includes(searchQ.toLowerCase())))
      setAllArtistsList(allArtistsData)

      // Apply custom sorting rules to ingestion requests
      const sortedRequests = sortIngestionRequests(allRequestsData)

      if (activeTab === 'users') {
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
        setArtists(allArtistsData.filter(a => (a.name || '').toLowerCase().includes(searchQ.toLowerCase())))
        setUsers(allUsers.filter(u =>
          u.role === 'artist' && (
            (u.username || '').toLowerCase().includes(searchQ.toLowerCase()) ||
            (u.email || '').toLowerCase().includes(searchQ.toLowerCase())
          )
        ))
        setArtistAccountsList(allUsers.filter(u => u.role === 'artist'))
        setIngestionRequests(sortedRequests)
      } else if (activeTab === 'ingestion') {
        setIngestionRequests(sortedRequests.filter(r =>
          r.song_name.toLowerCase().includes(searchQ.toLowerCase()) ||
          r.artist_name.toLowerCase().includes(searchQ.toLowerCase())
        ))
      } else {
        setIngestionRequests(sortedRequests)
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
    const albumTracks = tracks.filter((t) => Number(t.album_id) === Number(album.id))
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
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to remove track from album')
    }
  }

  const handleApproveRequest = async (requestId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setApprovingRequestId(requestId)
    try {
      await approveIngestionRequest(requestId)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to approve request')
    } finally {
      setApprovingRequestId(null)
    }
  }

  const handleRejectRequest = async (requestId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!confirm('Are you sure you want to reject this song ingestion request?')) return
    try {
      await rejectIngestionRequest(requestId)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to reject request')
    }
  }

  const handleDeleteRequest = async (requestId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!confirm('Are you sure you want to delete this ingestion request? This will permanently remove it from the queue.')) return
    try {
      await deleteIngestionRequest(requestId)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete request')
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
          artist_id: data.artist_id,
          duration_seconds: data.duration_seconds,
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
      alert(err.message || 'Failed to upload cover photo')
    } finally {
      setUploadingForId(null)
    }
  }

  // User CRUD Actions
  const openUserModal = (user: UserType | null = null, defaultRole: 'user' | 'artist' | 'admin' = 'user') => {
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
        if (Number(editingUser.id) === 1 || editingUser.username.toLowerCase() === 'admin') {
          alert('Master Admin profile is read-only and cannot be updated.')
          setUserModalOpen(false)
          return
        }

        if (currentUser?.role === 'admin' && Number(currentUser.id) !== 1 && Number(editingUser.id) !== Number(currentUser.id)) {
          alert('Secondary admins cannot modify details of other admin accounts.')
          setUserModalOpen(false)
          return
        }

        const payload: { username?: string; email?: string; password?: string; role?: 'user' | 'artist' | 'admin' } = {
          username: userForm.username,
          email: userForm.email,
          role: userForm.role as 'user' | 'artist' | 'admin',
        }
        if (userForm.password) {
          payload.password = userForm.password
        }
        await updateUser(editingUser.id, payload)
      } else {
        if (!userForm.password) {
          alert('Password is required for creating a new user')
          return
        }
        await createUser({
          username: userForm.username,
          email: userForm.email,
          password: userForm.password,
          role: userForm.role as 'user' | 'artist' | 'admin',
        })
      }
      setUserModalOpen(false)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to save user')
    }
  }

  const handleUserDelete = async (id: number) => {
    if (id === 1) {
      alert('Master Admin account cannot be deleted')
      return
    }

    if (currentUser?.role === 'admin' && Number(currentUser.id) !== 1 && Number(id) !== Number(currentUser.id)) {
      const targetUser = users.find(u => Number(u.id) === Number(id))
      if (targetUser?.role === 'admin') {
        alert('Secondary admins cannot delete other admin accounts. Only Master Admin can delete secondary admins.')
        return
      }
    }

    if (!confirm('Are you sure you want to delete this account?')) return
    try {
      await deleteUser(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete user')
    }
  }

  // Artist Catalog Profile Actions
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
    try {
      const payload = {
        name: artistForm.name,
        user_id: artistForm.user_id ? Number(artistForm.user_id) : null,
      }
      if (editingArtist) {
        await updateArtist(editingArtist.id, payload)
      } else {
        await createArtist(payload)
      }
      setArtistModalOpen(false)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to save artist profile')
    }
  }

  const handleArtistDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this artist profile?')) return
    try {
      await deleteArtist(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete artist profile')
    }
  }

  // Album CRUD Actions
  const openAlbumModal = (album: Album | null = null) => {
    setEditingAlbum(album)
    setAlbumCoverFile(null)
    setAlbumCoverPreview(album?.cover_url || null)
    if (album) {
      setAlbumForm({
        title: album.title,
        artist_id: album.artist_id ? String(album.artist_id) : 'unknown',
      })
    } else {
      setAlbumForm({
        title: '',
        artist_id: 'unknown', // Default to Unknown Artist for album creation!
      })
    }
    setAlbumModalOpen(true)
  }

  const handleAlbumSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let targetArtistId = Number(albumForm.artist_id)
    if (!albumForm.artist_id || albumForm.artist_id === 'unknown' || isNaN(targetArtistId)) {
      const unknownArtist = allArtistsList.find((a) => (a.name || '').toLowerCase().includes('unknown'))
      targetArtistId = unknownArtist ? unknownArtist.id : (allArtistsList[0]?.id || 1)
    }

    const payload = {
      title: albumForm.title,
      artist_id: targetArtistId,
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
    if (!confirm('Are you sure you want to delete this album and all its tracks?')) return
    try {
      await deleteAlbum(id)
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete album')
    }
  }

  return (
    <div className="space-y-6">
      {/* Title Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Admin Console</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green text-xs font-semibold uppercase">
              {currentUser?.role || 'ADMIN'}
            </span>
          </div>
          <p className="text-sm text-subtext mt-1">
            Platform management control center for users, artists, tracks, and discographies
          </p>
        </div>

        {activeTab === 'tracks' && (
          <button
            onClick={() => { setEditingTrack(null); setTrackModalOpen(true) }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Add Track
          </button>
        )}
        {activeTab === 'users' && (
          <button
            onClick={() => openUserModal(null, 'user')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Add User
          </button>
        )}
        {activeTab === 'admins' && (
          <button
            onClick={() => openUserModal(null, 'admin')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Add Admin
          </button>
        )}
        {activeTab === 'albums' && (
          <button
            onClick={() => openAlbumModal()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Add Album
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-highlight mb-4 gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => { setActiveTab('tracks'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'tracks' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Music size={16} />
          Tracks ({tracks.length})
        </button>
        <button
          onClick={() => { setActiveTab('albums'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'albums' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Disc size={16} />
          Albums ({albums.length})
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
          onClick={() => { setActiveTab('ingestion'); setSearchQ('') }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === 'ingestion' ? 'border-spotify-green text-spotify-green' : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <RefreshCw size={16} />
          Ingestion Queue ({ingestionRequests.length})
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
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-subtext">Loading admin console...</p>
        </div>
      ) : activeTab === 'artists' ? (
        /* ARTISTS TAB - ROLE SEPARATED DESIGN */
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
              <div className="grid grid-cols-[40px_1fr_1.5fr_120px_120px_100px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Username</span>
                <span>Email</span>
                <span>Created</span>
                <span>Updated</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {users.filter(u => u.role === 'artist').length === 0 ? (
                  <div className="py-8 text-center text-subtext text-sm">No artist accounts found</div>
                ) : (
                  users.filter(u => u.role === 'artist').map((u, index) => (
                    <div key={u.id} className="grid grid-cols-[40px_1fr_1.5fr_120px_120px_100px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-xs font-semibold text-subtext tabular-nums">{index + 1}</span>
                      <span className="text-sm font-medium truncate">{u.username}</span>
                      <span className="text-sm text-subtext truncate">{u.email}</span>
                      <span className="text-xs text-subtext truncate">{formatDate(u.created_at)}</span>
                      <span className="text-xs text-subtext truncate">{formatDate(u.updated_at)}</span>
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
              <div className="grid grid-cols-[40px_1fr_200px_120px_120px_100px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Artist Name</span>
                <span>Linked Account</span>
                <span>Created</span>
                <span>Updated</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {artists.length === 0 ? (
                  <div className="py-8 text-center text-subtext text-sm">No artist profiles found</div>
                ) : (
                  artists.map((a, index) => (
                    <div key={a.id} className="grid grid-cols-[40px_1fr_200px_120px_120px_100px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-xs font-semibold text-subtext tabular-nums">{index + 1}</span>
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <span className="text-sm text-subtext truncate">
                        {a.user_id ? (userMap[a.user_id] ? `${userMap[a.user_id]} (ID: ${a.user_id})` : `ID: ${a.user_id}`) : 'Not linked'}
                      </span>
                      <span className="text-xs text-subtext truncate">{formatDate(a.created_at)}</span>
                      <span className="text-xs text-subtext truncate">{formatDate(a.updated_at)}</span>
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
          {/* TRACKS TABLE (ALL USERS, SORTED DESCENDING BY ID/DATE) */}
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
                {tracks.length === 0 ? (
                  <div className="py-16 text-center text-subtext text-sm">
                    {searchQ ? 'No matching tracks found' : 'No tracks uploaded yet'}
                  </div>
                ) : (
                  tracks.map((track, index) => {
                    const album = albums.find((a) => Number(a.id) === Number(track.album_id))
                    const isCurrentPlaying = currentTrack?.id === track.id && isPlaying

                    return (
                      <div
                        key={track.id}
                        onClick={() => handlePlayTrack(track, tracks)}
                        className={`grid grid-cols-[40px_1fr_140px_110px_110px_90px_180px] gap-4 items-center px-4 py-3 cursor-pointer transition-colors ${isCurrentPlaying
                          ? 'bg-spotify-green/15 text-spotify-green font-semibold'
                          : 'hover:bg-surface-highlight/20'
                          }`}
                      >
                        <span className="text-xs font-semibold text-subtext tabular-nums">{index + 1}</span>
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
                            {track.artist_name && (
                              <p className="text-xs text-subtext truncate">{track.artist_name}</p>
                            )}
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
                            onClick={(e) => handlePlayTrack(track, tracks, e)}
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
                            title="Edit Track"
                          >
                            <Pencil size={14} />
                          </button>

                          {/* Upload Cover */}
                          <label
                            onClick={(e) => e.stopPropagation()}
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
                                if (file) openImageCropper(file, (croppedFile) => handleUploadTrackCover(track.id, croppedFile))
                                e.target.value = ''
                              }}
                            />
                          </label>

                          {/* Upload Audio */}
                          <label
                            onClick={(e) => e.stopPropagation()}
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

                          {/* Remove from Album (Convert to Single) */}
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
                            onClick={(e) => {
                              e.stopPropagation()
                              handleTrackDelete(track.id)
                            }}
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

          {/* NORMAL USERS TABLE */}
          {activeTab === 'users' && (
            <>
              <div className="grid grid-cols-[40px_1fr_1.5fr_120px_120px_120px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Username</span>
                <span>Email</span>
                <span>Created</span>
                <span>Updated</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {users.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No normal users found</div>
                ) : (
                  users.map((u, index) => (
                    <div key={u.id} className="grid grid-cols-[40px_1fr_1.5fr_120px_120px_120px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-xs font-semibold text-subtext tabular-nums">{index + 1}</span>
                      <span className="text-sm font-medium truncate">{u.username}</span>
                      <span className="text-sm text-subtext truncate">{u.email}</span>
                      <span className="text-xs text-subtext truncate">{formatDate(u.created_at)}</span>
                      <span className="text-xs text-subtext truncate">{formatDate(u.updated_at)}</span>
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
              <div className="grid grid-cols-[40px_1fr_1.5fr_120px_120px_120px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Username</span>
                <span>Email</span>
                <span>Created</span>
                <span>Updated</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {users.length === 0 ? (
                  <div className="py-12 text-center text-subtext text-sm">No administrators found</div>
                ) : (
                  users.map((u, index) => (
                    <div key={u.id} className="grid grid-cols-[40px_1fr_1.5fr_120px_120px_120px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors">
                      <span className="text-xs font-semibold text-subtext tabular-nums">{index + 1}</span>
                      <span className="text-sm font-medium truncate">{u.username}</span>
                      <span className="text-sm text-subtext truncate">{u.email}</span>
                      <span className="text-xs text-subtext truncate">{formatDate(u.created_at)}</span>
                      <span className="text-xs text-subtext truncate">{formatDate(u.updated_at)}</span>
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

          {/* ALBUMS TABLE WITH ACCORDION & SERIAL ID (ALL USERS, SORTED DESCENDING BY ID/DATE) */}
          {activeTab === 'albums' && (
            <>
              <div className="grid grid-cols-[40px_1fr_180px_90px_110px_110px_180px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Album Title</span>
                <span>Artist Profile</span>
                <span>Tracks</span>
                <span>Created</span>
                <span>Updated</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {albums.length === 0 ? (
                  <div className="py-16 text-center text-subtext text-sm">
                    {searchQ ? 'No matching albums found' : 'No albums created yet'}
                  </div>
                ) : (
                  albums.map((al, index) => {
                    const albumTracks = tracks.filter((t) => Number(t.album_id) === Number(al.id))
                    const isExpanded = expandedAlbumIds.has(al.id)
                    const artist = allArtistsList.find((a) => Number(a.id) === Number(al.artist_id))

                    return (
                      <div key={al.id} className="flex flex-col">
                        {/* Album Row */}
                        <div
                          onClick={(e) => toggleAlbumExpand(al.id, e)}
                          className={`grid grid-cols-[40px_1fr_180px_90px_110px_110px_180px] gap-4 items-center px-4 py-3 cursor-pointer transition-colors ${isExpanded ? 'bg-surface-highlight/40' : 'hover:bg-surface-highlight/20'
                            }`}
                        >
                          {/* Frontend Serial Number */}
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
                              <img src={al.cover_url} alt={al.title} className="w-10 h-10 rounded-md object-cover shrink-0 shadow" />
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                                <Disc size={18} className="text-subtext/50" />
                              </div>
                            )}
                            <span className="text-sm font-medium truncate">{al.title}</span>
                          </div>

                          <span className="text-sm text-subtext truncate">
                            {artist ? `${artist.name} (ID: ${artist.id})` : `Artist ID: ${al.artist_id}`}
                          </span>

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
                                  if (file) openImageCropper(file, (croppedFile) => handleUploadAlbumCover(al.id, croppedFile))
                                  e.target.value = ''
                                }}
                              />
                            </label>

                            {/* Delete Album */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAlbumDelete(al.id)
                              }}
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
                                No tracks in this album yet. Click "+ Add Track" to add one!
                              </div>
                            ) : (
                              <div className="divide-y divide-surface-highlight/20">
                                {albumTracks.map((track, i) => {
                                  const isActiveTrack = currentTrack?.id === track.id && isPlaying
                                  return (
                                    <div
                                      key={track.id}
                                      onClick={() => handlePlayTrack(track, albumTracks)}
                                      className={`grid grid-cols-[30px_1fr_130px_80px_180px] gap-3 items-center py-2 px-3 rounded-lg cursor-pointer transition-colors ${isActiveTrack
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
                                          className={`p-1.5 rounded-md text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
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
                                              if (file) openImageCropper(file, (croppedFile) => handleUploadTrackCover(track.id, croppedFile))
                                              e.target.value = ''
                                            }}
                                          />
                                        </label>

                                        {/* Upload Audio */}
                                        <label
                                          onClick={(e) => e.stopPropagation()}
                                          className={`p-1.5 rounded-md text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
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
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleTrackDelete(track.id)
                                          }}
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

          {/* INGESTION QUEUE TABLE */}
          {activeTab === 'ingestion' && (
            <>
              <div className="grid grid-cols-[40px_1.5fr_1.2fr_1.2fr_120px_150px_100px_140px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Song Name</span>
                <span>Artists</span>
                <span>Requested By</span>
                <span>Date Applied</span>
                <span>Source Link</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-surface-highlight/30">
                {ingestionRequests.length === 0 ? (
                  <div className="py-16 text-center text-subtext text-sm">
                    {searchQ ? 'No matching requests found' : 'No ingestion requests in the queue'}
                  </div>
                ) : (
                  ingestionRequests.map((req, index) => (
                    <div
                      key={req.id}
                      className="grid grid-cols-[40px_1.5fr_1.2fr_1.2fr_120px_150px_100px_140px] gap-4 items-center px-4 py-3 hover:bg-surface-highlight/20 transition-colors"
                    >
                      {/* Serial Number */}
                      <span className="text-xs font-semibold text-subtext tabular-nums">
                        {index + 1}
                      </span>

                      {/* Song Name */}
                      <span className="text-sm font-medium truncate text-primary animate-in fade-in" title={req.song_name}>
                        {req.song_name}
                      </span>

                      {/* Artists Name */}
                      <span className="text-sm text-subtext truncate animate-in fade-in" title={req.artist_name}>
                        {req.artist_name}
                      </span>

                      {/* Requested By User */}
                      <span className="text-sm text-subtext truncate animate-in fade-in" title={req.requested_by}>
                        {req.requested_by}
                      </span>

                      {/* Date Applied */}
                      <span className="text-xs text-subtext truncate">
                        {formatDate(req.created_at)}
                      </span>

                      {/* Clickable Youtube URL */}
                      <div className="flex items-center min-w-0">
                        {req.source_url ? (
                          <a
                            href={req.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-spotify-green hover:underline flex items-center gap-1 truncate"
                            title={req.source_url}
                          >
                            <ExternalLink size={12} className="shrink-0" />
                            YouTube URL
                          </a>
                        ) : (
                          <span className="text-xs text-subtext">—</span>
                        )}
                      </div>

                      {/* Status badge */}
                      <div>
                        {(() => {
                          const displayStatus = approvingRequestId === req.id ? 'processing' : req.status
                          return (
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase transition-all duration-300 ${
                                displayStatus === 'completed'
                                  ? 'bg-spotify-green/20 text-spotify-green'
                                  : displayStatus === 'processing'
                                    ? 'bg-blue-500/20 text-blue-400 animate-pulse'
                                    : displayStatus === 'pending'
                                      ? 'bg-amber-500/20 text-amber-400 animate-pulse'
                                      : displayStatus === 'rejected'
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'bg-zinc-700 text-zinc-300'
                              }`}
                            >
                              {displayStatus}
                            </span>
                          )
                        })()}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 justify-end">
                        {approvingRequestId === req.id ? (
                          <div className="flex items-center gap-1.5 text-xs text-subtext mr-1">
                            <RefreshCw size={12} className="animate-spin text-spotify-green" />
                            Ingesting...
                          </div>
                        ) : (
                          <>
                            {req.status === 'pending' && (
                              <>
                                <button
                                  onClick={(e) => handleApproveRequest(req.id, e)}
                                  disabled={approvingRequestId !== null}
                                  className={`px-2.5 py-1 rounded bg-spotify-green hover:bg-spotify-green/80 text-black text-xs font-bold transition-all ${
                                    approvingRequestId !== null ? 'opacity-50 cursor-not-allowed' : 'transform hover:scale-105'
                                  }`}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={(e) => handleRejectRequest(req.id, e)}
                                  disabled={approvingRequestId !== null}
                                  className={`px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold border border-surface-highlight/30 transition-all ${
                                    approvingRequestId !== null ? 'opacity-50 cursor-not-allowed' : 'transform hover:scale-105'
                                  }`}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {req.status === 'processing' && (
                              <div className="flex items-center gap-1.5 text-xs text-subtext mr-1">
                                <RefreshCw size={12} className="animate-spin text-spotify-green" />
                                Running...
                              </div>
                            )}
                            {req.status === 'failed' && (
                              <button
                                onClick={(e) => handleApproveRequest(req.id, e)}
                                disabled={approvingRequestId !== null}
                                className={`px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all mr-1 ${
                                  approvingRequestId !== null ? 'opacity-50 cursor-not-allowed' : 'transform hover:scale-105'
                                }`}
                              >
                                Retry
                              </button>
                            )}
                            {req.status !== 'pending' && req.status !== 'processing' && req.status !== 'failed' && (
                              <span className="text-xs text-subtext uppercase font-semibold mr-1">Processed</span>
                            )}
                            
                            {/* Always show a delete/trash button for queue cleanup */}
                            <button
                              onClick={(e) => handleDeleteRequest(req.id, e)}
                              disabled={approvingRequestId !== null}
                              className={`p-1.5 rounded-md text-subtext hover:text-red-400 hover:bg-surface-highlight transition-colors ${
                                approvingRequestId !== null ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              title="Delete Request"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
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
        onClose={() => {
          setTrackModalOpen(false)
          setEditingTrack(null)
        }}
        onSubmit={handleTrackSubmit}
        initialData={editingTrack}
        availableAlbums={albums}
        availableArtists={allArtistsList}
      />


      {/* USER FORM MODAL */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {(() => {
            const isMasterAdminTarget = editingUser && (Number(editingUser.id) === 1 || editingUser.username.toLowerCase() === 'admin')
            const isSecondaryAdminEditingOtherAdmin =
              editingUser &&
              currentUser?.role === 'admin' &&
              Number(currentUser.id) !== 1 &&
              Number(editingUser.id) !== Number(currentUser.id) &&
              editingUser.role === 'admin'

            const isReadOnlyModal = Boolean(isMasterAdminTarget || isSecondaryAdminEditingOtherAdmin)
            const canChangeRole = Boolean(!isReadOnlyModal && (Number(currentUser?.id) === 1 || editingUser?.id === currentUser?.id))

            return (
              <form onSubmit={handleUserSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">
                    {editingUser ? (isReadOnlyModal ? 'View Account Details (Read Only)' : 'Edit User') : 'Create User'}
                  </h2>
                  {isReadOnlyModal && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 uppercase">
                      Read Only
                    </span>
                  )}
                </div>

                {isReadOnlyModal && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
                    <p className="font-semibold">Access Restriction:</p>
                    {isMasterAdminTarget ? (
                      <p>Master Admin profile details are 100% read-only for security reasons.</p>
                    ) : (
                      <p>Admins are only permitted to edit their own profile details.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-subtext mb-1">Username</label>
                  <input
                    type="text"
                    required
                    readOnly={isReadOnlyModal}
                    value={userForm.username}
                    onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors ${isReadOnlyModal ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-subtext mb-1">Email</label>
                  <input
                    type="email"
                    required
                    readOnly={isReadOnlyModal}
                    value={userForm.email}
                    onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors ${isReadOnlyModal ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                  />
                </div>

                {!isReadOnlyModal && (
                  <div>
                    <label className="block text-sm font-medium text-subtext mb-1">
                      {editingUser ? 'New Password (leave empty to keep current)' : 'Password'}
                    </label>
                    <input
                      type="password"
                      required={!editingUser}
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
                    disabled={!canChangeRole}
                    className={`w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors uppercase font-semibold ${!canChangeRole ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                  >
                    <option value="user">USER</option>
                    <option value="artist">ARTIST</option>
                    <option value="admin">ADMIN</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setUserModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm hover:bg-surface-highlight transition-colors"
                  >
                    {isReadOnlyModal ? 'Close' : 'Cancel'}
                  </button>
                  {!isReadOnlyModal && (
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors"
                    >
                      Save
                    </button>
                  )}
                </div>
              </form>
            )
          })()}
        </div>
      )}

      {/* ARTIST PROFILE MODAL */}
      {artistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleArtistSubmit} className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left">
            <h2 className="text-lg font-bold">{editingArtist ? 'Edit Artist Profile' : 'Add Artist Profile'}</h2>
            <div>
              <label className="block text-sm font-medium text-subtext mb-1">Public Display Name</label>
              <input
                type="text"
                required
                value={artistForm.name}
                onChange={e => setArtistForm({ ...artistForm, name: e.target.value })}
                placeholder="Artist or Band Name"
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>

            {/* Searchable Artist Account Select Dropdown */}
            <div className="relative font-sans text-left" ref={artistAccountDropdownRef}>
              <label className="block text-sm font-medium text-subtext mb-1">Linked User Account (Role = ARTIST)</label>
              <div
                onClick={() => setShowArtistAccountDropdown(!showArtistAccountDropdown)}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary cursor-pointer border-2 border-transparent hover:border-spotify-green/50 flex justify-between items-center transition-colors"
              >
                <span className="truncate">
                  {artistForm.user_id
                    ? (artistAccountsList.find(u => Number(u.id) === Number(artistForm.user_id))?.username
                      ? `${artistAccountsList.find(u => Number(u.id) === Number(artistForm.user_id))?.username} (ID: ${artistForm.user_id})`
                      : `User ID: ${artistForm.user_id}`)
                    : 'None (Unlinked Catalog Profile)'}
                </span>
                <span className="text-xs text-subtext select-none">▼</span>
              </div>

              {showArtistAccountDropdown && (
                <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl z-50 p-2 space-y-2 max-h-60 overflow-hidden flex flex-col">
                  <input
                    type="text"
                    placeholder="Search artist account..."
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
                      className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-spotify-green font-semibold"
                    >
                      None (Unlinked Catalog Profile)
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
                          <span className="truncate mr-2">{u.username}</span>
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
                    if (file) openImageCropper(file, (croppedFile) => {
                      setAlbumCoverFile(croppedFile)
                      setAlbumCoverPreview(URL.createObjectURL(croppedFile))
                    })
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
                  {albumForm.artist_id === 'unknown' || !albumForm.artist_id
                    ? '🎤 Unknown Artist'
                    : allArtistsList.find((a) => a.id === Number(albumForm.artist_id))?.name || `Artist ID: ${albumForm.artist_id}`}
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
                    <div
                      onClick={() => {
                        setAlbumForm({ ...albumForm, artist_id: 'unknown' })
                        setShowArtistSelectDropdown(false)
                        setArtistSelectSearch('')
                      }}
                      className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-spotify-green font-semibold"
                    >
                      🎤 Unknown Artist (Default)
                    </div>

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
