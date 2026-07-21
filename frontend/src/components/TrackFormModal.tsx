import { useState, useEffect, useRef } from 'react'
import { X, Upload, Music, Image as ImageIcon } from 'lucide-react'
import type { Track, Album } from '@/types'
import { listAlbums } from '@/api/albums'

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
  artistId?: number | null
}

export default function TrackFormModal({ isOpen, onClose, onSubmit, initialData, availableAlbums, artistId }: Props) {
  const [title, setTitle] = useState('')
  const [albumId, setAlbumId] = useState<string>('')
  const [duration, setDuration] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Searchable album dropdown states
  const [albumsList, setAlbumsList] = useState<Album[]>([])
  const [albumSearch, setAlbumSearch] = useState('')
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title)
      setAlbumId(initialData.album_id ? String(initialData.album_id) : 'single')
      setDuration(initialData.duration_seconds ? String(initialData.duration_seconds) : '')
      setAudioFile(null)
      setFileName('')
      setCoverFile(null)
      setCoverPreview(initialData.cover_url || null)
    } else {
      setTitle('')
      setAlbumId('single') // Default to Single Track for easy uploading
      setDuration('')
      setAudioFile(null)
      setFileName('')
      setCoverFile(null)
      setCoverPreview(null)
    }
  }, [initialData, isOpen])

  useEffect(() => {
    if (isOpen) {
      if (availableAlbums) {
        setAlbumsList(availableAlbums)
      } else {
        listAlbums(0, 200)
          .then(setAlbumsList)
          .catch(console.error)
      }
    }
  }, [isOpen, availableAlbums])


  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAlbumDropdown(false)
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

    // Automatically set title if empty
    if (!title) {
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
      setTitle(nameWithoutExt)
    }

    // Auto-detect duration using the Web Audio/HTMLAudioElement trick
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

    setCoverFile(file)
    const previewUrl = URL.createObjectURL(file)
    setCoverPreview(previewUrl)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const finalAlbumId = albumId === 'single' || !albumId ? null : Number(albumId)

    onSubmit({
      title,
      album_id: finalAlbumId,
      artist_id: artistId ?? initialData?.artist_id,
      duration_seconds: duration ? Number(duration) : undefined,
      audioFile: audioFile || undefined,
      coverFile: coverFile || undefined,
    })
  }



  const formatDuration = (secStr: string) => {
    const sec = Number(secStr)
    if (isNaN(sec) || sec <= 0) return ''
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">
            {initialData ? 'Edit Track' : 'Create Track'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-highlight transition-colors text-subtext hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cover Photo attachment */}
          <div>
            <label className="block text-sm font-medium text-subtext mb-1.5">
              Track Cover Photo (Optional)
            </label>
            <div
              onClick={() => coverInputRef.current?.click()}
              className="relative aspect-square w-full max-h-56 mx-auto rounded-xl border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden group bg-surface-highlight/20 shadow-md"
            >
              {coverPreview ? (
                <>
                  <img
                    src={coverPreview}
                    alt="Cover Preview"
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-medium gap-1.5 p-4 text-center backdrop-blur-[2px]">
                    <ImageIcon size={24} />
                    <span>Click to change track photo</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-subtext group-hover:text-primary transition-colors p-4 text-center">
                  <ImageIcon size={32} />
                  <span className="text-xs font-medium">
                    {coverFile ? coverFile.name : 'Click to attach track photo'}
                  </span>
                  <span className="text-[10px] text-subtext/70">
                    If left empty, album cover photo will be used
                  </span>
                </div>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverChange}
                className="hidden"
              />
            </div>
          </div>

          {/* File attachment */}
          <div>
            <label className="block text-sm font-medium text-subtext mb-1.5">
              {initialData ? 'Replace Audio File (Optional)' : 'Attach Audio File'}
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors"
            >
              <Upload size={24} className="text-subtext mb-2 animate-bounce" />
              <span className="text-sm font-medium text-primary">
                {fileName || (initialData ? 'Click to replace audio file...' : 'Choose an audio file...')}
              </span>
              <span className="text-xs text-subtext mt-1">
                Duration will be auto-calculated
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>


          <div>
            <label className="block text-sm font-medium text-subtext mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              placeholder="Track title"
            />
          </div>

          {/* Searchable Album Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-subtext mb-1.5">
              Album
            </label>
            <div
              onClick={() => setShowAlbumDropdown(!showAlbumDropdown)}
              className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary cursor-pointer border-2 border-transparent hover:border-spotify-green/50 flex justify-between items-center transition-colors"
            >
              <span className="truncate font-medium">
                {albumId === 'single' || !albumId
                  ? '🎵 Single Track (No Album)'
                  : albumsList.find((a) => a.id === Number(albumId))?.title || `Album ID: ${albumId}`}
              </span>
              <span className="text-xs text-subtext select-none">▼</span>
            </div>

            {showAlbumDropdown && (
              <div className="absolute left-0 right-0 mt-1 bg-surface-elevated border border-surface-highlight rounded-lg shadow-2xl z-50 p-2 space-y-2">
                <input
                  type="text"
                  placeholder="Search album..."
                  value={albumSearch}
                  onChange={(e) => setAlbumSearch(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-surface-highlight text-xs text-primary outline-none border border-transparent focus:border-spotify-green/30"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
                  {/* Standalone Single Option */}
                  <div
                    onClick={() => {
                      setAlbumId('single')
                      setShowAlbumDropdown(false)
                      setAlbumSearch('')
                    }}
                    className={`px-3 py-2 text-xs rounded-md cursor-pointer truncate flex justify-between items-center ${
                      albumId === 'single' || !albumId
                        ? 'bg-spotify-green/20 text-spotify-green font-semibold'
                        : 'hover:bg-surface-highlight text-primary'
                    }`}
                  >
                    <span>🎵 Standalone Single (No Album)</span>
                    <span className="text-[10px] text-subtext">Single</span>
                  </div>

                  {albumsList
                    .filter((a) =>
                      a.title.toLowerCase().includes(albumSearch.toLowerCase())
                    )
                    .map((a) => (
                      <div
                        key={a.id}
                        onClick={() => {
                          setAlbumId(String(a.id))
                          setShowAlbumDropdown(false)
                          setAlbumSearch('')
                        }}
                        className={`px-3 py-2 text-xs rounded-md cursor-pointer truncate flex justify-between items-center ${
                          albumId === String(a.id)
                            ? 'bg-spotify-green/20 text-spotify-green font-semibold'
                            : 'hover:bg-surface-highlight text-primary'
                        }`}
                      >
                        <span className="truncate mr-2">{a.title}</span>
                        <span className="text-[10px] text-subtext shrink-0">Album ID: {a.id}</span>
                      </div>
                    ))}

                  {albumsList.filter((a) =>
                    a.title.toLowerCase().includes(albumSearch.toLowerCase())
                  ).length === 0 && (
                      <div className="px-3 py-2 text-xs text-subtext text-center">
                        No albums found
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-subtext mb-1.5">
              Duration
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={duration ? `${duration} seconds (${formatDuration(duration)})` : ''}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight/50 text-sm text-subtext outline-none border-2 border-transparent select-none cursor-not-allowed"
                placeholder="Upload a file to detect duration"
              />
              {duration && (
                <Music size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-spotify-green" />
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm font-medium hover:bg-surface-highlight transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-black text-sm font-semibold hover:bg-spotify-green-hover transition-colors hover:scale-[1.02]"
            >
              {initialData ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
