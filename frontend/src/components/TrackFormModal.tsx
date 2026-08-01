import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, Music, Image as ImageIcon } from 'lucide-react'
import type { Track, Album, Artist } from '@/types'
import { listAlbums } from '@/api/albums'
import { listArtists } from '@/api/artists'
import ImageCropperModal from './ImageCropperModal'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    title: string
    album_id: number | null
    artist_id?: number | null
    duration_seconds?: number
    audioFile?: File
    coverFile?: File
  }) => void
  initialData?: Track | null
  availableAlbums?: Album[]
  availableArtists?: Artist[]
  artistId?: number | null
  disableArtistSelect?: boolean
}

export default function TrackFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  availableAlbums,
  availableArtists,
  artistId,
  disableArtistSelect,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [albumId, setAlbumId] = useState<string>('single')
  const [selectedArtistId, setSelectedArtistId] = useState<string>('unknown')
  const [duration, setDuration] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Cropper states
  const [cropperFile, setCropperFile] = useState<File | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)

  // Searchable album dropdown states
  const [albumsList, setAlbumsList] = useState<Album[]>([])
  const [albumSearch, setAlbumSearch] = useState('')
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false)
  const albumDropdownRef = useRef<HTMLDivElement>(null)

  // Searchable artist dropdown states
  const [artistsList, setArtistsList] = useState<Artist[]>([])
  const [artistSearch, setArtistSearch] = useState('')
  const [showArtistDropdown, setShowArtistDropdown] = useState(false)
  const artistDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSubmitting(false)
    if (initialData) {
      setTitle(initialData.title)
      setAlbumId(initialData.album_id ? String(initialData.album_id) : 'single')
      setSelectedArtistId(
        initialData.artist_id
          ? String(initialData.artist_id)
          : artistId
          ? String(artistId)
          : 'unknown'
      )
      setDuration(initialData.duration_seconds ? String(initialData.duration_seconds) : '')
      setAudioFile(null)
      setFileName('')
      setCoverFile(null)
      setCoverPreview(initialData.cover_url || null)
    } else {
      setTitle('')
      setAlbumId('single')
      setSelectedArtistId(artistId ? String(artistId) : 'unknown')
      setDuration('')
      setAudioFile(null)
      setFileName('')
      setCoverFile(null)
      setCoverPreview(null)
    }
  }, [initialData, isOpen, artistId])

  useEffect(() => {
    if (isOpen) {
      if (availableAlbums) {
        setAlbumsList(availableAlbums)
      } else {
        listAlbums(0, 100)
          .then(setAlbumsList)
          .catch(console.error)
      }

      if (availableArtists) {
        setArtistsList(availableArtists)
      } else {
        listArtists(0, 100)
          .then(setArtistsList)
          .catch(console.error)
      }
    }
  }, [isOpen, availableAlbums, availableArtists])

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (albumDropdownRef.current && !albumDropdownRef.current.contains(event.target as Node)) {
        setShowAlbumDropdown(false)
      }
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(event.target as Node)) {
        setShowArtistDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAudioFile(file)
    setFileName(file.name)

    if (!title) {
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
      setTitle(nameWithoutExt)
    }

    const objectUrl = URL.createObjectURL(file)
    const audio = new Audio(objectUrl)
    audio.addEventListener('loadedmetadata', () => {
      const seconds = Math.round(audio.duration)
      setDuration(String(seconds))
      URL.revokeObjectURL(objectUrl)
    })
  }

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCropperFile(file)
    setCropperOpen(true)
    e.target.value = ''
  }

  const handleSelectAlbum = (selectedId: string) => {
    setAlbumId(selectedId)
    setShowAlbumDropdown(false)
    setAlbumSearch('')

    if (selectedId !== 'single' && selectedId !== '') {
      const selAlbum = albumsList.find((a) => String(a.id) === String(selectedId))
      if (selAlbum) {
        // Automatically sync track's artist to match album's artist
        setSelectedArtistId(selAlbum.artist_id ? String(selAlbum.artist_id) : 'unknown')
      }
    }
  }

  const handleSelectArtist = (selectedId: string) => {
    setSelectedArtistId(selectedId)
    setShowArtistDropdown(false)
    setArtistSearch('')

    // If an album is currently selected, verify artist consistency
    if (albumId !== 'single' && albumId !== '') {
      const selAlbum = albumsList.find((a) => String(a.id) === String(albumId))
      if (selAlbum) {
        const albumArtistId = selAlbum.artist_id ? String(selAlbum.artist_id) : 'unknown'
        if (albumArtistId !== selectedId) {
          // Reset album to single if track's artist does not match album's artist
          setAlbumId('single')
        }
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      const finalAlbumId = albumId === 'single' || !albumId ? null : Number(albumId)
      const finalArtistId =
        selectedArtistId === 'unknown' || !selectedArtistId ? null : Number(selectedArtistId)

      await onSubmit({
        title,
        album_id: finalAlbumId,
        artist_id: finalArtistId,
        duration_seconds: duration ? Number(duration) : undefined,
        audioFile: audioFile || undefined,
        coverFile: coverFile || undefined,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const formatDuration = (secStr: string) => {
    const sec = Number(secStr)
    if (isNaN(sec) || sec <= 0) return ''
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const filteredAlbums = albumsList.filter((a) => {
    const matchesSearch = a.title.toLowerCase().includes(albumSearch.toLowerCase())
    if (!matchesSearch) return false
    // If an artist is selected (and not unknown), only show albums by that artist
    if (selectedArtistId && selectedArtistId !== 'unknown') {
      return String(a.artist_id) === String(selectedArtistId)
    }
    return true
  })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-elevated rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin shadow-2xl border border-surface-highlight">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">
            {initialData ? 'Edit Track' : 'Create Track'}
          </h2>
          <button
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className={`p-1.5 rounded-full hover:bg-surface-highlight transition-colors text-subtext hover:text-primary ${
              submitting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
            }`}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* Cover Photo attachment */}
          <div>
            <label className="block text-sm font-medium text-subtext mb-1.5">
              Track Cover Photo (Optional)
            </label>
            <div
              onClick={() => !submitting && coverInputRef.current?.click()}
              className={`relative aspect-square w-full max-h-48 mx-auto rounded-xl border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden group bg-surface-highlight/20 shadow-md ${
                submitting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
              }`}
            >
              {coverPreview ? (
                <>
                  <img
                    src={coverPreview}
                    alt="Cover preview"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-bold text-white">
                    Replace Photo
                  </div>
                </>
              ) : (
                <>
                  <ImageIcon size={28} className="text-subtext/60 mb-2 group-hover:text-spotify-green transition-colors" />
                  <span className="text-xs font-semibold text-primary">Attach Cover Art</span>
                  <span className="text-[10px] text-subtext mt-1">PNG or JPG</span>
                </>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              disabled={submitting}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  setCropperFile(file)
                  setCropperOpen(true)
                }
                e.target.value = ''
              }}
            />
          </div>

          {/* Audio File upload */}
          <div>
            <label className="block text-sm font-medium text-subtext mb-1.5">
              Audio File {initialData ? '(Optional)' : '(Required)'}
            </label>
            <div
              onClick={() => !submitting && fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-surface-highlight/10 ${
                submitting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
              }`}
            >
              <Upload size={22} className="text-subtext/60 mb-1.5" />
              <span className="text-xs font-semibold text-primary block truncate max-w-full">
                {fileName || 'Select audio file...'}
              </span>
              <span className="text-[10px] text-subtext mt-0.5">
                MP3, WAV, FLAC, M4A, AAC
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              required={!initialData}
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-subtext mb-1">
              Track Title
            </label>
            <input
              type="text"
              required
              disabled={submitting}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors ${
                submitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              placeholder="e.g. Midnight City"
            />
          </div>

          {/* Searchable Artist Dropdown */}
          <div className="relative" ref={artistDropdownRef}>
            <label className="block text-sm font-medium text-subtext mb-1">
              Artist Profile
            </label>
            {disableArtistSelect ? (
              <div className="w-full px-3 py-2 rounded-lg bg-surface-highlight/50 text-sm text-subtext border-2 border-transparent select-none cursor-not-allowed flex justify-between items-center">
                <span className="truncate">
                  {selectedArtistId === 'unknown'
                    ? '🎤 Unknown Artist'
                    : artistsList.find((a) => String(a.id) === selectedArtistId)?.name || `Artist ID: ${selectedArtistId}`}
                </span>
              </div>
            ) : (
              <>
                <div
                  onClick={() => setShowArtistDropdown(!showArtistDropdown)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary cursor-pointer border-2 border-transparent hover:border-spotify-green/50 flex justify-between items-center transition-colors"
                >
                  <span className="truncate">
                    {selectedArtistId === 'unknown'
                      ? '🎤 Unknown Artist'
                      : artistsList.find((a) => String(a.id) === selectedArtistId)?.name || `Artist ID: ${selectedArtistId}`}
                  </span>
                  <span className="text-xs text-subtext select-none">▼</span>
                </div>

                {showArtistDropdown && (
                  <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl z-50 p-2 space-y-2 max-h-48 overflow-hidden flex flex-col">
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
                          setSelectedArtistId('unknown')
                          setShowArtistDropdown(false)
                          setArtistSearch('')
                        }}
                        className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-spotify-green font-semibold"
                      >
                        🎤 Unknown Artist (Default)
                      </div>

                      {artistsList
                        .filter((a) =>
                          (a.name || '').toLowerCase().includes(artistSearch.toLowerCase())
                        )
                        .map((a) => (
                          <div
                            key={a.id}
                            onClick={() => {
                              setSelectedArtistId(String(a.id))
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
                        (a.name || '').toLowerCase().includes(artistSearch.toLowerCase())
                      ).length === 0 && (
                          <div className="px-3 py-2 text-xs text-subtext text-center">
                            No matches found
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Searchable Album Dropdown */}
          <div className="relative" ref={albumDropdownRef}>
            <label className="block text-sm font-medium text-subtext mb-1">
              Album (Select 'Single' if not in an album)
            </label>
            <div
              onClick={() => !submitting && setShowAlbumDropdown(!showAlbumDropdown)}
              className={`w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary cursor-pointer border-2 border-transparent hover:border-spotify-green/50 flex justify-between items-center transition-colors ${
                submitting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
              }`}
            >
              <span className="truncate">
                {albumId === 'single'
                  ? '💿 Single (No Album)'
                  : albumsList.find((al) => String(al.id) === albumId)?.title || `Album ID: ${albumId}`}
              </span>
              <span className="text-xs text-subtext select-none">▼</span>
            </div>

            {showAlbumDropdown && (
              <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl z-50 p-2 space-y-2 max-h-48 overflow-hidden flex flex-col">
                <input
                  type="text"
                  placeholder="Search album..."
                  value={albumSearch}
                  onChange={(e) => setAlbumSearch(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-surface-highlight text-xs text-primary outline-none border border-transparent focus:border-spotify-green/30"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
                  <div
                    onClick={() => {
                      setAlbumId('single')
                      setShowAlbumDropdown(false)
                      setAlbumSearch('')
                    }}
                    className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-spotify-green font-semibold"
                  >
                    💿 Single (No Album)
                  </div>

                  {filteredAlbums.map((al) => (
                    <div
                      key={al.id}
                      onClick={() => {
                        setAlbumId(String(al.id))
                        setShowAlbumDropdown(false)
                        setAlbumSearch('')
                      }}
                      className="px-3 py-2 text-xs hover:bg-surface-highlight rounded-md cursor-pointer truncate text-primary flex justify-between items-center"
                    >
                      <span className="truncate mr-2">{al.title}</span>
                      <span className="text-[10px] text-subtext shrink-0">ID: {al.id}</span>
                    </div>
                  ))}

                  {filteredAlbums.length === 0 && (
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
              disabled={submitting}
              onClick={onClose}
              className={`flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm font-medium hover:bg-surface-highlight transition-colors ${
                submitting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-accent-text text-sm font-semibold hover:bg-spotify-green-hover transition-colors flex items-center justify-center gap-1.5 transition-all ${
                submitting ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:scale-[1.02]'
              }`}
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {initialData ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                initialData ? 'Save' : 'Create'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Image Cropper Modal */}
      <ImageCropperModal
        isOpen={cropperOpen}
        imageFile={cropperFile}
        onClose={() => setCropperOpen(false)}
        onCropComplete={(croppedFile) => {
          setCoverFile(croppedFile)
          setCoverPreview(URL.createObjectURL(croppedFile))
        }}
      />
    </div>,
    document.body
  )
}
