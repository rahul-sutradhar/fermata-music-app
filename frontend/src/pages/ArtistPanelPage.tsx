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
  Mic,
  Square,
  Volume2,
  VolumeX,
  Edit,
  Save,
  Globe,
  Download,
  Disc2,
  Pause,
  RefreshCw,
  X,
  FileAudio,
  CheckCircle,
  Sliders,
} from 'lucide-react'
import {
  listTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  uploadTrackAudio,
  uploadTrackCover,
} from '@/api/tracks'
import { listArtists, createArtist, getArtistSingles, getArtist, getArtistAlbums } from '@/api/artists'
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

import {
  splitAppTrack,
  splitExternalTrack,
  saveDraft,
  listDrafts,
  updateDraft,
  deleteDraft,
  publishDraft,
  listBackups,
  type Draft,
} from '@/api/studio'

import { formatMixerTime } from '@/utils/timeHelpers';

type TabType = 'tracks' | 'albums' | 'studio' | 'edit'

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return '—'
  }
}

function renderDate(dateStr?: string | null) {
  if (!dateStr) return <span className="text-xs text-subtext">—</span>
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return <span className="text-xs text-subtext">—</span>
    const datePart = d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
    const timePart = d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
    return (
      <div className="flex flex-col text-xs text-subtext select-none leading-normal text-left">
        <span className="font-medium text-primary">{datePart}</span>
        <span className="text-[10px] text-subtext/75">{timePart}</span>
      </div>
    )
  } catch {
    return <span className="text-xs text-subtext">—</span>
  }
}

// ── CUSTOM MIXER COMPONENTS ──────────────────────────────────────────────────

interface VolumeWedgeProps {
  value: number
  onChange: (val: number) => void
}

function VolumeWedge({ value, onChange }: VolumeWedgeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const handleMouseMove = (e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    onChange(percent)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    onChange(percent)

    const onMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="flex items-center gap-1.5 select-none">
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        className="relative w-16 h-3 bg-zinc-800 cursor-pointer rounded overflow-hidden"
        style={{
          clipPath: 'polygon(0% 100%, 100% 0%, 100% 100%)'
        }}
      >
        {/* Active Volume Wedge Fill */}
        <div
          className="absolute top-0 left-0 h-full bg-zinc-400 pointer-events-none"
          style={{
            width: `${value * 100}%`
          }}
        />
        {/* Volume Handle Slider Line */}
        <div
          className="absolute top-0 h-full w-[3px] bg-white border border-black/50 pointer-events-none shadow"
          style={{
            left: `calc(${value * 100}% - 1.5px)`
          }}
        />
      </div>
      <span className="text-[10px] text-subtext w-6 text-right font-mono tabular-nums select-none">
        {Math.round(value * 100)}
      </span>
    </div>
  )
}

interface WaveformTrackProps {
  audioUrl?: string | null
  color: string
  height?: number
  currentTime: number
  duration: number
  onTimeUpdate?: (time: number) => void
}

function WaveformTrack({ audioUrl, color, height = 50, currentTime, duration, onTimeUpdate }: WaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const peaksRef = useRef<number[]>([])

  useEffect(() => {
    if (!audioUrl) {
      peaksRef.current = []
      drawFlat()
      return
    }

    // Generate deterministic simulated peaks based on URL hash for responsive styling
    let hash = 0
    for (let i = 0; i < audioUrl.length; i++) {
      hash = audioUrl.charCodeAt(i) + ((hash << 5) - hash)
    }

    const count = 300
    const peaks: number[] = []
    for (let i = 0; i < count; i++) {
      const seed = Math.sin(hash + i * 0.15) * Math.cos(hash - i * 0.05)
      const val = Math.abs(seed) * 0.65 + 0.05
      const envelope = Math.sin((i / count) * Math.PI)
      peaks.push(val * envelope)
    }

    peaksRef.current = peaks
    drawWave()
  }, [audioUrl])

  useEffect(() => {
    drawWave()
  }, [currentTime, duration])

  const drawFlat = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
  }

  const drawWave = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const peaks = peaksRef.current
    if (peaks.length === 0) {
      drawFlat()
      return
    }

    const barWidth = w / peaks.length
    const progress = duration > 0 ? currentTime / duration : 0
    const progressIdx = Math.floor(progress * peaks.length)

    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i]
      const barH = peak * h * 0.8
      const x = i * barWidth
      const y = (h - barH) / 2

      if (i < progressIdx) {
        ctx.fillStyle = color
      } else {
        ctx.fillStyle = '#262626'
      }
      ctx.fillRect(x, y, barWidth - 1.5, barH)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={height}
      className="w-full h-full cursor-pointer bg-zinc-950/20 hover:bg-zinc-900/10 transition-colors"
      onClick={(e) => {
        if (!canvasRef.current || duration <= 0) return
        const rect = canvasRef.current.getBoundingClientRect()
        const clickX = e.clientX - rect.left
        const ratio = clickX / rect.width
        if (onTimeUpdate) {
          onTimeUpdate(ratio * duration)
        }
      }}
    />
  )
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
  const [workingMessage, setWorkingMessage] = useState<string | null>(null)

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

  // ── RECORDING STUDIO STATES & HOOKS ──────────────────────────────────────────
  const [myDrafts, setMyDrafts] = useState<Draft[]>([])
  const [myBackups, setMyBackups] = useState<number[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null)
  const [studioDraftTitle, setStudioDraftTitle] = useState('My Vocal Recording')

  const [studioBackingSource, setStudioBackingSource] = useState<'none' | 'app' | 'external'>('none')
  const [studioSelectedTrackId, setStudioSelectedTrackId] = useState<number | null>(null)
  const [allLibraryTracks, setAllLibraryTracks] = useState<Track[]>([])
  const [trackSearchQ, setTrackSearchQ] = useState('')
  const [loadingLibraryTracks, setLoadingLibraryTracks] = useState(false)

  const [studioExternalFile, setStudioExternalFile] = useState<File | null>(null)
  const [studioExternalFileName, setStudioExternalFileName] = useState('')
  const [backingFileKey, setBackingFileKey] = useState<string | null>(null)

  const [isSplitting, setIsSplitting] = useState(false)
  const [isSplit, setIsSplit] = useState(false)
  const [backingKeys, setBackingKeys] = useState<{
    split_vocals_key?: string | null
    split_drums_key?: string | null
    split_bass_key?: string | null
    split_other_key?: string | null
    split_guitar_key?: string | null
    split_piano_key?: string | null
  } | null>(null)

  const [isPlayingMix, setIsPlayingMix] = useState(false)
  const [mixerTime, setMixerTime] = useState(0)
  const [mixerDuration, setMixerDuration] = useState(0)

  const [studioVolumes, setStudioVolumes] = useState<Record<string, number>>({
    vocal: 1.0,
    backingVocal: 1.0,
    music: 1.0,
    bass: 1.0,
    drums: 1.0,
    guitar: 1.0,
    piano: 1.0
  })
  const [studioMutes, setStudioMutes] = useState<Record<string, boolean>>({
    vocal: false,
    backingVocal: false,
    music: false,
    bass: false,
    drums: false,
    guitar: false,
    piano: false
  })
  const [studioSolos, setStudioSolos] = useState<Record<string, boolean>>({
    vocal: false,
    backingVocal: false,
    music: false,
    bass: false,
    drums: false,
    guitar: false,
    piano: false
  })

  const [isRecording, setIsRecording] = useState(false)
  const [recordOriginalVocal, setRecordOriginalVocal] = useState(false)
  const [vocalBlob, setVocalBlob] = useState<Blob | null>(null)
  const [vocalUrl, setVocalUrl] = useState<string | null>(null)

  // Publish Modal States
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [publishingDraftId, setPublishingDraftId] = useState<number | null>(null)
  const [publishTitle, setPublishTitle] = useState('')
  const [publishAlbumId, setPublishAlbumId] = useState<number | null>(null)
  const [publishLyrics, setPublishLyrics] = useState('')
  const [publishCoverFile, setPublishCoverFile] = useState<File | null>(null)
  const [publishCoverPreview, setPublishCoverPreview] = useState<string | null>(null)
  const publishCoverInputRef = useRef<HTMLInputElement>(null)

  // Mixer Audio Refs
  const audioRefs: Record<string, React.MutableRefObject<HTMLAudioElement | null>> = {
    vocal: useRef<HTMLAudioElement | null>(null),
    backingVocal: useRef<HTMLAudioElement | null>(null),
    music: useRef<HTMLAudioElement | null>(null),
    bass: useRef<HTMLAudioElement | null>(null),
    drums: useRef<HTMLAudioElement | null>(null),
    guitar: useRef<HTMLAudioElement | null>(null),
    piano: useRef<HTMLAudioElement | null>(null)
  }

  // All mixer track keys (order = rendering order in mixer)
  const ALL_MIXER_KEYS = ['vocal', 'backingVocal', 'music', 'bass', 'drums', 'guitar', 'piano']

  // Web Audio Context & MediaRecorder Refs
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioSourcesRef = useRef<Record<string, MediaElementAudioSourceNode>>({})
  const isRestoredRef = useRef(false)

  // Web Audio dynamic real-time gain node updates
  const gainNodesRef = useRef<Record<string, GainNode>>({})

  // Audio Editor: Vocal & Backing track trim/alignment settings (saved inside mix_volumes JSON)
  const [vocalTrimStart, setVocalTrimStart] = useState<number>(0)
  const [vocalTrimEnd, setVocalTrimEnd] = useState<number>(0)
  const [vocalOffset, setVocalOffset] = useState<number>(0)
  const [backingTrimStart, setBackingTrimStart] = useState<number>(0)
  const [backingTrimEnd, setBackingTrimEnd] = useState<number>(0)

  // Fetch drafts & backups
  const loadStudioData = async () => {
    try {
      const drafts = await listDrafts()
      setMyDrafts(drafts)
      const backups = await listBackups()
      setMyBackups(backups)
    } catch (err) {
      console.error('Failed to load studio data:', err)
    }
  }

  useEffect(() => {
    if (activeTab === 'studio') {
      loadStudioData()
    }
  }, [activeTab])

  // Initialize/re-create an HTML5 Audio Element for the mixer
  const initAudioElement = (key: string, url: string) => {
    if (audioRefs[key].current) {
      audioRefs[key].current.pause()
      audioRefs[key].current.src = ''
    }
    const audio = new Audio(url)
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.onloadedmetadata = () => {
      updateMixerDuration()
    }
    audioRefs[key].current = audio
  }

  const updateMixerDuration = () => {
    let maxDur = 0
    const keys = ALL_MIXER_KEYS
    keys.forEach(k => {
      const el = audioRefs[k].current
      if (el && el.duration && !isNaN(el.duration) && el.duration > maxDur) {
        maxDur = el.duration
      }
    })
    setMixerDuration(maxDur)
  }

  const applyVolumes = () => {
    const keys = ALL_MIXER_KEYS
    const isAnySoloed = Object.values(studioSolos).some(Boolean)

    keys.forEach(key => {
      const el = audioRefs[key].current
      let vol = studioVolumes[key] ?? 1.0
      if (studioMutes[key]) {
        vol = 0
      } else if (isAnySoloed) {
        vol = studioSolos[key] ? vol : 0
      }

      if (el) {
        el.volume = vol
      }

      // Live recording mix: update active Web Audio GainNodes in real time
      const liveGainNode = gainNodesRef.current[key]
      if (liveGainNode && audioCtxRef.current) {
        liveGainNode.gain.setValueAtTime(vol, audioCtxRef.current.currentTime)
      }
    })
  }

  useEffect(() => {
    applyVolumes()
  }, [studioVolumes, studioMutes, studioSolos])

  // Mixer playback sync check interval
  useEffect(() => {
    let interval: any = null
    if (isPlayingMix) {
      interval = setInterval(() => {
        // Find reference track that is actively playing
        let refAudio: HTMLAudioElement | null = null
        const keys = ALL_MIXER_KEYS
        for (const key of keys) {
          const el = audioRefs[key].current
          if (el && el.src && !el.paused && el.duration > 0) {
            refAudio = el
            break
          }
        }

        if (refAudio) {
          const curTime = refAudio.currentTime
          setMixerTime(curTime)

          // Auto-align other tracks if they drift by > 80ms
          keys.forEach(key => {
            const el = audioRefs[key].current
            if (el && el.src && !el.paused && el.duration > 0 && el !== refAudio) {
              if (Math.abs(el.currentTime - curTime) > 0.08) {
                el.currentTime = curTime
              }
            }
          })
        } else {
          // End of playback reached on all active tracks
          setIsPlayingMix(false)
          setMixerTime(0)
        }
      }, 100)
    } else {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [isPlayingMix])

  // Auto-restore studio active workspace on mount
  useEffect(() => {
    const saved = localStorage.getItem('fermata_studio_active_state')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)

        // Restore tab
        if (parsed.activeTab) setActiveTab(parsed.activeTab)

        // Restore metadata
        if (parsed.selectedDraftId) setSelectedDraftId(parsed.selectedDraftId)
        if (parsed.studioDraftTitle) setStudioDraftTitle(parsed.studioDraftTitle)
        if (parsed.studioSelectedTrackId) setStudioSelectedTrackId(parsed.studioSelectedTrackId)
        if (parsed.backingFileKey) setBackingFileKey(parsed.backingFileKey)
        if (parsed.isSplit !== undefined) setIsSplit(parsed.isSplit)
        if (parsed.backingKeys) setBackingKeys(parsed.backingKeys)
        if (parsed.studioVolumes) setStudioVolumes(parsed.studioVolumes)
        if (parsed.studioMutes) setStudioMutes(parsed.studioMutes)
        if (parsed.studioSolos) setStudioSolos(parsed.studioSolos)
        if (parsed.recordOriginalVocal !== undefined) setRecordOriginalVocal(parsed.recordOriginalVocal)
        if (parsed.studioBackingSource) setStudioBackingSource(parsed.studioBackingSource)
        if (parsed.studioExternalFileName) setStudioExternalFileName(parsed.studioExternalFileName)

        // Restore vocal audio element if we have a valid non-blob vocalUrl
        if (parsed.vocalUrl) {
          setVocalUrl(parsed.vocalUrl)
          initAudioElement('vocal', parsed.vocalUrl)
        }

        // Restore split stem audio elements if isSplit is true
        if (parsed.isSplit && parsed.backingKeys) {
          const keys = parsed.backingKeys
          if (keys.split_vocals_key) initAudioElement('backingVocal', keys.split_vocals_key)
          if (keys.split_other_key) initAudioElement('music', keys.split_other_key)
          if (keys.split_bass_key) initAudioElement('bass', keys.split_bass_key)
          if (keys.split_drums_key) initAudioElement('drums', keys.split_drums_key)
          if (keys.split_guitar_key) initAudioElement('guitar', keys.split_guitar_key)
          if (keys.split_piano_key) initAudioElement('piano', keys.split_piano_key)
        }
      } catch (e) {
        console.error('Failed to restore studio state:', e)
      }
    }
    isRestoredRef.current = true
  }, [])

  // Automatically load unsplit backing track audio when tracks load or selection changes
  useEffect(() => {
    if (studioSelectedTrackId && !isSplit) {
      const source = allLibraryTracks.length > 0 ? allLibraryTracks : myTracks
      const track = source.find(t => t.id === studioSelectedTrackId)
      if (track && track.audio_url) {
        // Only load if not already loaded to avoid resetting play position
        const musicEl = audioRefs.music.current
        if (musicEl && musicEl.src !== track.audio_url) {
          initAudioElement('music', track.audio_url)
        }
      }
    }
  }, [allLibraryTracks, myTracks, studioSelectedTrackId, isSplit])

  // Auto-save studio active workspace to localStorage
  useEffect(() => {
    if (!isRestoredRef.current) return

    const stateToSave = {
      activeTab,
      selectedDraftId,
      studioDraftTitle,
      studioSelectedTrackId,
      backingFileKey,
      isSplit,
      backingKeys,
      studioVolumes,
      studioMutes,
      studioSolos,
      recordOriginalVocal,
      vocalUrl: vocalUrl && !vocalUrl.startsWith('blob:') ? vocalUrl : null,
      studioBackingSource,
      studioExternalFileName
    }
    localStorage.setItem('fermata_studio_active_state', JSON.stringify(stateToSave))
  }, [
    activeTab,
    selectedDraftId,
    studioDraftTitle,
    studioSelectedTrackId,
    backingFileKey,
    isSplit,
    backingKeys,
    studioVolumes,
    studioMutes,
    studioSolos,
    recordOriginalVocal,
    vocalUrl,
    studioBackingSource,
    studioExternalFileName
  ])

  // Prevent accidental navigation/closing with unsaved vocal recordings
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (vocalBlob) {
        e.preventDefault()
        e.returnValue = 'You have unsaved recording changes in the studio. Are you sure you want to leave?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [vocalBlob])

  // Lock body scroll when any modal or loading overlay is active
  useEffect(() => {
    const isAnyModalOpen = publishModalOpen || trackModalOpen || albumModalOpen || cropperOpen || !!workingMessage
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [publishModalOpen, trackModalOpen, albumModalOpen, cropperOpen, workingMessage])

  const playMixer = () => {
    const keys = ALL_MIXER_KEYS
    let playedAny = false
    keys.forEach(k => {
      const el = audioRefs[k].current
      if (el && el.src) {
        el.play().catch(e => console.warn(`Playback blocked for ${k}:`, e))
        playedAny = true
      }
    })
    if (playedAny) {
      setIsPlayingMix(true)
    }
  }

  const pauseMixer = () => {
    setIsPlayingMix(false)
    const keys = ALL_MIXER_KEYS
    keys.forEach(k => {
      const el = audioRefs[k].current
      if (el) el.pause()
    })
  }

  const stopMixer = () => {
    setIsPlayingMix(false)
    const keys = ALL_MIXER_KEYS
    keys.forEach(k => {
      const el = audioRefs[k].current
      if (el) {
        el.pause()
        el.currentTime = 0
      }
    })
    setMixerTime(0)
  }

  const handleSeek = (time: number) => {
    const keys = ALL_MIXER_KEYS
    keys.forEach(k => {
      const el = audioRefs[k].current
      if (el && el.src && el.duration && !isNaN(el.duration)) {
        el.currentTime = Math.min(time, el.duration)
      }
    })
    setMixerTime(time)
  }

  const startRecording = async () => {
    // Pause without clearing src so layers survive the re-record
    pauseMixer()
    handleSeek(0)
    // Clear dynamic gain nodes list
    gainNodesRef.current = {}
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const dest = audioCtx.createMediaStreamDestination()

      const isAnySoloed = Object.values(studioSolos).some(Boolean)

      // ── Microphone (user's live vocal) ─────────────────────────────────────
      const micSource = audioCtx.createMediaStreamSource(stream)
      const micGain = audioCtx.createGain()
      const vocalVol = studioMutes.vocal ? 0 : (isAnySoloed ? (studioSolos.vocal ? studioVolumes.vocal : 0) : studioVolumes.vocal)
      micGain.gain.value = vocalVol
      micSource.connect(micGain)
      // User's live mic → recorder (always recorded)
      micGain.connect(dest)

      // Store microphone gain node to allow real-time volume controls during recording
      gainNodesRef.current['vocal'] = micGain

      // ── All 6 backing stems ─────────────────────────────────────────────────
      // Each stem:
      //   - always routed to speakers (audioCtx.destination) at its set volume
      //   - routed to recorder (dest) for every stem EXCEPT backingVocal
      //   - backingVocal only routed to recorder if "record original vocal" checkbox is ON
      const backingKeys = ['music', 'bass', 'drums', 'backingVocal', 'guitar', 'piano']
      backingKeys.forEach(key => {
        const audioEl = audioRefs[key].current
        if (audioEl && audioEl.src) {
          try {
            const sourceNode = audioCtx.createMediaElementSource(audioEl)
            const gainNode = audioCtx.createGain()

            const activeVol = studioMutes[key] ? 0 : (isAnySoloed ? (studioSolos[key] ? studioVolumes[key] : 0) : studioVolumes[key])
            gainNode.gain.value = activeVol

            sourceNode.connect(gainNode)

            // Always send to speakers for monitoring
            gainNode.connect(audioCtx.destination)

            // Send to recorder for all stems; backingVocal only if checkbox is checked
            if (key !== 'backingVocal' || recordOriginalVocal) {
              gainNode.connect(dest)
            }

            // Save gainNode to allow real-time volume changes during recording
            gainNodesRef.current[key] = gainNode
          } catch (err) {
            console.error(`Web Audio source creation failed for ${key}:`, err)
          }
        }
      })

      const mediaRecorder = new MediaRecorder(dest.stream)
      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setVocalBlob(blob)
        const vUrl = URL.createObjectURL(blob)
        setVocalUrl(vUrl)
        initAudioElement('vocal', vUrl)

        // Stop all microphone tracks
        stream.getTracks().forEach(t => t.stop())
        audioCtx.close()
        // Reset gain nodes map
        gainNodesRef.current = {}
      }

      recorderRef.current = mediaRecorder
      audioCtxRef.current = audioCtx

      // Start recording and trigger audio playback
      mediaRecorder.start()
      setIsRecording(true)
      playMixer()

    } catch (err) {
      console.error('Failed to start vocal recording:', err)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop()
    }
    setIsRecording(false)
    pauseMixer()
    handleSeek(0)
  }

  // Choose an app track to attach
  const handleAttachAppTrack = (trackId: number) => {
    const track = allLibraryTracks.find(t => t.id === trackId) || myTracks.find(t => t.id === trackId)
    if (!track) return
    setStudioSelectedTrackId(trackId)
    setStudioBackingSource('app')
    setStudioExternalFile(null)
    setStudioExternalFileName('')
    setIsSplit(false)
    setBackingKeys(null)

    // Reset mixer backing audios
    const backingKeys = ['music', 'bass', 'drums', 'backingVocal']
    backingKeys.forEach(k => {
      if (audioRefs[k].current) {
        audioRefs[k].current.pause()
        audioRefs[k].current.src = ''
      }
    })
  }

  // Choose an external file to attach
  const handleAttachExternalTrack = (file: File) => {
    setStudioExternalFile(file)
    setStudioExternalFileName(file.name)
    setStudioBackingSource('external')
    setStudioSelectedTrackId(null)
    setIsSplit(false)
    setBackingKeys(null)

    // Reset mixer backing audios
    const backingKeys = ['music', 'bass', 'drums', 'backingVocal']
    backingKeys.forEach(k => {
      if (audioRefs[k].current) {
        audioRefs[k].current.pause()
        audioRefs[k].current.src = ''
      }
    })
  }

  // Trigger stem separation
  const handleSplitBackingTrack = async () => {
    setIsSplitting(true)
    try {
      let result: any = null
      if (studioBackingSource === 'app' && studioSelectedTrackId) {
        result = await splitAppTrack(studioSelectedTrackId)
      } else if (studioBackingSource === 'external' && studioExternalFile) {
        result = await splitExternalTrack(studioExternalFile)
        if (result.backing_file_key) {
          setBackingFileKey(result.backing_file_key)
        }
      } else {
        alert('Please select or upload a backing track first.')
        setIsSplitting(false)
        return
      }

      setIsSplit(true)
      setBackingKeys(result)

      // Load all 6 split layer audio elements
      initAudioElement('music', result.split_other_url)
      initAudioElement('bass', result.split_bass_url)
      initAudioElement('drums', result.split_drums_url)
      initAudioElement('backingVocal', result.split_vocals_url)
      initAudioElement('guitar', result.split_guitar_url)
      initAudioElement('piano', result.split_piano_url)

      alert('Track split into 6 stems successfully! All layers are loaded into the mixer.')
    } catch (err: any) {
      alert(err.message || 'Stem separation failed.')
    } finally {
      setIsSplitting(false)
    }
  }

  // Load a Draft for editing
  const handleSelectDraft = (draft: Draft) => {
    setSelectedDraftId(draft.id)
    setStudioDraftTitle(draft.title)
    setStudioVolumes(draft.mix_volumes)
    setVocalBlob(null)
    setVocalUrl(draft.vocal_url)

    // Load trim/offset settings from mix_volumes JSON if present
    setVocalTrimStart(Number(draft.mix_volumes.vocal_trim_start || 0))
    setVocalTrimEnd(Number(draft.mix_volumes.vocal_trim_end || 0))
    setVocalOffset(Number(draft.mix_volumes.vocal_offset || 0))
    setBackingTrimStart(Number(draft.mix_volumes.backing_trim_start || 0))
    setBackingTrimEnd(Number(draft.mix_volumes.backing_trim_end || 0))

    if (draft.vocal_url) {
      initAudioElement('vocal', draft.vocal_url)
    }

    if (draft.backing_track_id) {
      setStudioBackingSource('app')
      setStudioSelectedTrackId(draft.backing_track_id)
      setStudioExternalFile(null)
      setStudioExternalFileName('')
    } else if (draft.backing_file_key) {
      setStudioBackingSource('external')
      setStudioSelectedTrackId(null)
      setStudioExternalFile(null)
      // Display basename
      const parts = draft.backing_file_key.split('/')
      setStudioExternalFileName(parts[parts.length - 1])
      setBackingFileKey(draft.backing_file_key)
    } else {
      setStudioBackingSource('none')
      setStudioSelectedTrackId(null)
      setStudioExternalFile(null)
      setStudioExternalFileName('')
      setBackingFileKey(null)
    }

    setIsSplit(draft.is_split)

    if (draft.is_split) {
      setBackingKeys({
        split_vocals_key: draft.split_vocals_url,
        split_drums_key: draft.split_drums_url,
        split_bass_key: draft.split_bass_url,
        split_other_key: draft.split_other_url,
        split_guitar_key: draft.split_guitar_url,
        split_piano_key: draft.split_piano_url
      })
      initAudioElement('music', draft.split_other_url || '')
      initAudioElement('bass', draft.split_bass_url || '')
      initAudioElement('drums', draft.split_drums_url || '')
      initAudioElement('backingVocal', draft.split_vocals_url || '')
      initAudioElement('guitar', draft.split_guitar_url || '')
      initAudioElement('piano', draft.split_piano_url || '')
    } else {
      setBackingKeys(null)
      // reset backing audios
      const backingKeys = ['music', 'bass', 'drums', 'backingVocal', 'guitar', 'piano']
      backingKeys.forEach(k => {
        if (audioRefs[k].current) {
          audioRefs[k].current.pause()
          audioRefs[k].current.src = ''
        }
      })
    }
  }

  // Save current mixer progress to drafts
  const handleSaveDraft = async () => {
    if (!vocalUrl && !vocalBlob) {
      alert('Cannot save draft: No vocal recording exists yet. Record your vocal first!')
      return
    }

    // Pack mix volumes, trims and alignment offset settings together
    const mixPayload = {
      ...studioVolumes,
      vocal_trim_start: vocalTrimStart,
      vocal_trim_end: vocalTrimEnd,
      vocal_offset: vocalOffset,
      backing_trim_start: backingTrimStart,
      backing_trim_end: backingTrimEnd
    }

    setWorkingMessage('Saving draft to workspace...')
    try {
      if (selectedDraftId) {
        // Convert Blob to File if they re-recorded, otherwise send null
        const vocalFile = vocalBlob ? new File([vocalBlob], 'vocal_recording.webm', { type: vocalBlob.type }) : null
        // Edit existing draft metadata / volumes
        await updateDraft(selectedDraftId, {
          title: studioDraftTitle,
          backing_track_id: studioSelectedTrackId,
          backing_file_key: backingFileKey,
          is_split: isSplit,
          split_vocals_key: backingKeys?.split_vocals_key || null,
          split_drums_key: backingKeys?.split_drums_key || null,
          split_bass_key: backingKeys?.split_bass_key || null,
          split_other_key: backingKeys?.split_other_key || null,
          split_guitar_key: backingKeys?.split_guitar_key || null,
          split_piano_key: backingKeys?.split_piano_key || null,
          mix_volumes: mixPayload
        }, vocalFile)
        alert('Draft updated successfully!')
        setVocalBlob(null) // Reset blob since uploaded
      } else {
        // Save new draft recording
        if (!vocalBlob) {
          alert('Cannot save new draft: Record a vocal track first!')
          return
        }

        // Convert Blob to File
        const vocalFile = new File([vocalBlob], 'vocal_recording.webm', { type: vocalBlob.type })

        await saveDraft({
          title: studioDraftTitle,
          file: vocalFile,
          backingTrackId: studioSelectedTrackId,
          backingFileKey: backingFileKey,
          mixVolumes: mixPayload,
          isSplit: isSplit,
          splitVocalsKey: backingKeys?.split_vocals_key || null,
          splitDrumsKey: backingKeys?.split_drums_key || null,
          splitBassKey: backingKeys?.split_bass_key || null,
          splitOtherKey: backingKeys?.split_other_key || null,
          splitGuitarKey: backingKeys?.split_guitar_key || null,
          splitPianoKey: backingKeys?.split_piano_key || null
        })
        alert('Vocal recording saved as draft successfully!')
        setVocalBlob(null) // Reset blob since uploaded
      }
      loadStudioData()
    } catch (err: any) {
      alert(err.message || 'Failed to save draft.')
    } finally {
      setWorkingMessage(null)
    }
  }

  const handleDeleteDraft = async (draftId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!confirm('Are you sure you want to delete this draft and all its recording files?')) return
    try {
      await deleteDraft(draftId)
      if (selectedDraftId === draftId) {
        handleResetStudio()
      }
      loadStudioData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete draft.')
    }
  }

  const handleResetStudio = () => {
    stopMixer()
    setSelectedDraftId(null)
    setStudioDraftTitle('My Vocal Recording')
    setStudioBackingSource('none')
    setStudioSelectedTrackId(null)
    setStudioExternalFile(null)
    setStudioExternalFileName('')
    setBackingFileKey(null)
    setIsSplit(false)
    setBackingKeys(null)
    setVocalBlob(null)
    setVocalUrl(null)
    setStudioVolumes({ vocal: 1.0, backingVocal: 1.0, music: 1.0, bass: 1.0, drums: 1.0, guitar: 1.0, piano: 1.0 })
    setStudioMutes({ vocal: false, backingVocal: false, music: false, bass: false, drums: false, guitar: false, piano: false })
    setStudioSolos({ vocal: false, backingVocal: false, music: false, bass: false, drums: false, guitar: false, piano: false })

    // Reset trim and alignment offset settings
    setVocalTrimStart(0)
    setVocalTrimEnd(0)
    setVocalOffset(0)
    setBackingTrimStart(0)
    setBackingTrimEnd(0)

    ALL_MIXER_KEYS.forEach(k => {
      if (audioRefs[k].current) {
        audioRefs[k].current.pause()
        audioRefs[k].current.src = ''
      }
    })
    setMixerTime(0)
    setMixerDuration(0)

    // Clear persisted studio state so a fresh start is clean
    localStorage.removeItem('fermata_studio_active_state')
  }

  // Publish Dialog Controls
  const handleOpenPublishModal = (draftId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const draft = myDrafts.find(d => d.id === draftId)
    if (!draft) return
    setPublishingDraftId(draftId)
    setPublishTitle(draft.title)
    setPublishAlbumId(null)
    setPublishLyrics('')
    setPublishCoverFile(null)
    setPublishCoverPreview(null)
    setPublishModalOpen(true)
  }

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!publishingDraftId) return
    if (!publishCoverFile) {
      alert('Please select a cover photo for the track.')
      return
    }

    setLoading(true)
    setWorkingMessage('Mixing and publishing your master track...')
    try {
      await publishDraft(publishingDraftId, {
        title: publishTitle,
        albumId: publishAlbumId,
        lyrics: publishLyrics,
        coverImage: publishCoverFile
      })
      alert('Track mixed and published successfully! Original raw track uploaded as download backup.')
      setPublishModalOpen(false)
      handleResetStudio()
      setActiveTab('tracks')
      loadArtistData()
    } catch (err: any) {
      alert(err.message || 'Publishing failed.')
    } finally {
      setLoading(false)
      setWorkingMessage(null)
    }
  }

  // Download raw track backup helper
  const handleDownloadBackup = (trackId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_HOSTED_BASE || 'http://localhost:8000'
    const token = useAuthStore.getState().token

    // Open backup download route in a new tab with auth token parameter,
    // or trigger dynamic redirect
    const downloadUrl = `${API_BASE}/studio/tracks/${trackId}/backup/download?token=${token}`

    // We can also fetch the presigned URL directly if token is set in cookies,
    // but the easiest is using standard window open.
    // Let's create a temporary link to download using fetch or directly
    window.open(downloadUrl, '_blank')
  }


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
      // 1. Fetch artist profile linked to current user directly by ID
      let profile: Artist | null = null
      try {
        profile = await getArtist(currentUser.id)
      } catch (err) {
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
        // 2. Fetch albums belonging directly to this artist
        const filteredAlbums = await getArtistAlbums(profile.id, 0, 100).catch(() => [] as Album[])
        setMyAlbums(filteredAlbums)

        // 3. Fetch tracks belonging directly to this artist (album tracks + singles)
        const albumTracksPromises = filteredAlbums.map((al) =>
          getAlbumTracks(al.id, 0, 100).catch(() => [] as Track[]),
        )
        const singlesPromise = getArtistSingles(profile.id, 0, 100).catch(() => [] as Track[])

        const [albumTrackGroups, singles] = await Promise.all([
          Promise.all(albumTracksPromises),
          singlesPromise,
        ])

        const trackMap = new Map<number, Track>()

        albumTrackGroups.flat().forEach((t) => trackMap.set(t.id, t))
        singles.forEach((t) => trackMap.set(t.id, t))

        setMyTracks(Array.from(trackMap.values()))
      }
    } catch (err) {
      console.error('Failed to load artist panel data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Lazily load all library tracks when user wants to pick a backing track from the app
  useEffect(() => {
    if (studioBackingSource !== 'app') return
    if (allLibraryTracks.length > 0) return // already loaded
    setLoadingLibraryTracks(true)
    listTracks(0, 100)  // backend cap is 100
      .then((tracks) => setAllLibraryTracks(tracks))
      .catch((err) => console.error('Failed to load library tracks:', err))
      .finally(() => setLoadingLibraryTracks(false))
  }, [studioBackingSource])

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
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-accent-text text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Upload Track
          </button>
        )}

        {activeTab === 'albums' && (
          <button
            onClick={() => openAlbumModal()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-spotify-green text-accent-text text-sm font-semibold hover:bg-spotify-green-hover transition-all hover:scale-[1.02] shadow-lg shrink-0"
          >
            <Plus size={16} />
            Create Album
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-highlight mb-4 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => {
            setActiveTab('tracks')
            setSearchQ('')
          }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all shrink-0 ${activeTab === 'tracks'
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
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all shrink-0 ${activeTab === 'albums'
            ? 'border-spotify-green text-spotify-green'
            : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Disc size={16} />
          My Albums ({myAlbums.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('studio')
            setSearchQ('')
          }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all shrink-0 ${activeTab === 'studio'
            ? 'border-spotify-green text-spotify-green'
            : 'border-transparent text-subtext hover:text-primary'
            }`}
        >
          <Mic size={16} />
          Recording Studio
        </button>

        {selectedDraftId && (
          <button
            onClick={() => {
              setActiveTab('edit')
              setSearchQ('')
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all shrink-0 ${activeTab === 'edit'
              ? 'border-spotify-green text-spotify-green'
              : 'border-transparent text-subtext hover:text-primary'
              }`}
          >
            <Sliders size={16} />
            Audio Editor
          </button>
        )}
      </div>

      {/* Search Input */}
      {activeTab !== 'studio' && activeTab !== 'edit' && (
        <div className="relative max-w-sm mb-4 animate-in fade-in duration-100">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={`Search my ${activeTab}...`}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-primary/20 transition-colors placeholder:text-subtext/50"
          />
        </div>
      )}

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
              <div className="grid grid-cols-[28px_1fr_120px] md:grid-cols-[40px_1fr_140px_110px_110px_90px_180px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Title</span>
                <span className="hidden md:block">Album</span>
                <span className="hidden md:block">Created</span>
                <span className="hidden md:block">Updated</span>
                <span className="hidden md:block">Duration</span>
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
                        className={`grid grid-cols-[28px_1fr_120px] md:grid-cols-[40px_1fr_140px_110px_110px_90px_180px] gap-4 items-center px-4 py-3 cursor-pointer transition-colors ${isCurrentPlaying
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
                            <span className="text-xs text-subtext block md:hidden truncate">
                              {track.album_id ? (album?.title || `Album #${track.album_id}`) : 'Single'}
                            </span>
                            {track.audio_url ? (
                              <span className="text-[10px] text-spotify-green">Audio attached</span>
                            ) : (
                              <span className="text-[10px] text-subtext">No audio</span>
                            )}
                          </div>
                        </div>

                        {/* Album / Single badge */}
                        <span className="text-sm truncate hidden md:block">
                          {track.album_id ? (
                            <span className="text-subtext font-medium truncate block">{album?.title || `Album #${track.album_id}`}</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-spotify-green/20 text-spotify-green text-xs font-semibold">
                              Single
                            </span>
                          )}
                        </span>

                        <div className="hidden md:block">{renderDate(track.created_at)}</div>
                        <div className="hidden md:block">{renderDate(track.updated_at)}</div>

                        <span className="text-sm text-subtext tabular-nums hidden md:block">
                          {track.duration_seconds
                            ? `${Math.floor(track.duration_seconds / 60)}:${(track.duration_seconds % 60).toString().padStart(2, '0')}`
                            : '—'}
                        </span>


                        <div className="flex items-center gap-1 justify-end flex-wrap">
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
                            className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
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
                            className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === track.id ? 'opacity-50 pointer-events-none' : ''
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

                          {/* Download Backup */}
                          {myBackups.includes(track.id) && (
                            <button
                              onClick={(e) => handleDownloadBackup(track.id, e)}
                              className="p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors"
                              title="Download Original Raw MP3 Backup"
                            >
                              <Download size={14} />
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
              <div className="grid grid-cols-[28px_1fr_100px] md:grid-cols-[40px_1fr_90px_110px_110px_180px] gap-4 px-4 py-3 bg-surface-highlight/40 text-xs font-semibold text-subtext uppercase tracking-wider">
                <span>#</span>
                <span>Album Title</span>
                <span className="hidden md:block">Tracks</span>
                <span className="hidden md:block">Created</span>
                <span className="hidden md:block">Updated</span>
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
                          className={`grid grid-cols-[28px_1fr_100px] md:grid-cols-[40px_1fr_90px_110px_110px_180px] gap-4 items-center px-4 py-3 cursor-pointer transition-colors ${isExpanded ? 'bg-surface-highlight/40' : 'hover:bg-surface-highlight/20'
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
                            <div className="min-w-0">
                              <span className="text-sm font-medium truncate block">{al.title}</span>
                              <span className="text-xs text-subtext block md:hidden truncate">
                                {albumTracks.length} track{albumTracks.length === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>

                          <span className="text-sm text-subtext tabular-nums hidden md:block">
                            {albumTracks.length} track{albumTracks.length === 1 ? '' : 's'}
                          </span>

                          <div className="hidden md:block">{renderDate(al.created_at)}</div>
                          <div className="hidden md:block">{renderDate(al.updated_at)}</div>


                          <div className="flex items-center gap-1 justify-end flex-wrap">
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
                              className={`p-2 rounded-lg text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors cursor-pointer ${uploadingForId === al.id ? 'opacity-50 pointer-events-none' : ''
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

                                        className={`grid grid-cols-[24px_1fr_120px] md:grid-cols-[30px_1fr_130px_80px_180px] gap-3 items-center py-2 px-3 rounded-lg cursor-pointer transition-colors ${isActiveTrack
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
                                        <span className="text-[11px] text-subtext truncate hidden md:block">
                                          Added: {formatDate(track.updated_at || track.created_at)}
                                        </span>


                                        {/* Duration */}
                                        <span className="text-xs text-subtext tabular-nums hidden md:block">
                                          {track.duration_seconds
                                            ? `${Math.floor(track.duration_seconds / 60)}:${(track.duration_seconds % 60).toString().padStart(2, '0')}`
                                            : '—'}
                                        </span>

                                        {/* Track Actions */}
                                        <div className="flex items-center gap-1 justify-end flex-wrap">
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

                                          {/* Download Backup */}
                                          {myBackups.includes(track.id) && (
                                            <button
                                              onClick={(e) => handleDownloadBackup(track.id, e)}
                                              className="p-1.5 rounded-md text-subtext hover:text-spotify-green hover:bg-surface-highlight transition-colors"
                                              title="Download Original Raw MP3 Backup"
                                            >
                                              <Download size={13} />
                                            </button>
                                          )}

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

          {/* ─── STUDIO RECORDING TAB ─────────────────────────────────────── */}
          {activeTab === 'studio' && (
            <div className="flex flex-col text-left text-primary min-h-[600px] bg-surface rounded-xl overflow-hidden border border-surface-highlight/30 shadow divide-y divide-surface-highlight/25 font-sans">

              {/* ── Top Header: Session & Actions ── */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-5 bg-surface-elevated/40 border-b border-surface-highlight/10">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-2.5 rounded-lg bg-surface-highlight/20 border border-surface-highlight/30 text-spotify-green shadow-inner shrink-0">
                    <Mic size={22} className="animate-pulse" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-subtext uppercase tracking-widest mb-0.5">Session Name</span>
                    <input
                      type="text"
                      value={studioDraftTitle}
                      onChange={(e) => setStudioDraftTitle(e.target.value)}
                      className="text-lg font-bold bg-transparent border-b border-transparent hover:border-surface-highlight focus:border-spotify-green outline-none py-0.5 w-72 text-primary transition-colors placeholder:text-subtext/40"
                      placeholder="My Studio Recording"
                    />
                  </div>
                  {selectedDraftId && (() => {
                    const sorted = [...myDrafts].sort((a, b) => a.id - b.id)
                    const idx = sorted.findIndex(d => d.id === selectedDraftId)
                    const serialNo = idx !== -1 ? idx + 1 : ''
                    return (
                      <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-spotify-green/10 text-spotify-green text-[10px] font-bold border border-spotify-green/20">
                        Draft #{serialNo}
                      </span>
                    )
                  })()}
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={handleResetStudio}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-surface-highlight/20 border border-surface-highlight text-xs font-semibold text-primary hover:bg-surface-highlight/40 transition-all active:scale-95"
                    title="Clear current workspace"
                  >
                    <RefreshCw size={12} />
                    New Session
                  </button>
                  <button
                    onClick={handleSaveDraft}
                    className="flex items-center gap-1.5 px-4.5 py-2 rounded-md bg-spotify-green text-accent-text text-xs font-bold hover:brightness-110 shadow transition-all active:scale-95"
                  >
                    <Save size={13} />
                    Save Draft
                  </button>
                </div>
              </div>

              {/* ── Section: Accompaniment / Backing Track Selection ── */}
              <div className="px-6 py-5 bg-surface-elevated/20 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">1. Choose Accompaniment Source</span>
                  <div className="h-px flex-1 bg-surface-highlight/20" />
                </div>

                <div className="flex flex-col gap-4">
                  {/* Styled Source Selector Buttons */}
                  <div className="flex items-center gap-1.5 bg-surface-highlight/10 p-1 rounded-lg border border-surface-highlight/30 w-fit shadow-inner">
                    {([
                      { key: 'none', label: 'Vocal Only' },
                      { key: 'app', label: 'From Library' },
                      { key: 'external', label: 'Upload Audio File' },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (key === 'none') {
                            setStudioBackingSource('none')
                            setStudioSelectedTrackId(null)
                            setStudioExternalFile(null)
                            setStudioExternalFileName('')
                            setBackingFileKey(null)
                            setIsSplit(false)
                            setBackingKeys(null)
                          } else {
                            setStudioBackingSource(key)
                          }
                        }}
                        className={`px-4 py-2 rounded text-xs font-bold transition-all ${studioBackingSource === key
                          ? 'bg-surface text-primary shadow-sm border border-surface-highlight/20'
                          : 'text-subtext hover:text-primary'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ── Option A: Library Track Grid Selection ── */}
                  {studioBackingSource === 'app' && (
                    <div className="space-y-3.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="relative max-w-md">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtext" />
                        <input
                          type="text"
                          value={trackSearchQ}
                          onChange={(e) => setTrackSearchQ(e.target.value)}
                          placeholder={loadingLibraryTracks ? 'Loading catalog…' : 'Search by track name or artist…'}
                          className="w-full bg-surface-highlight/30 text-sm text-primary pl-9 pr-8 py-2 rounded-lg outline-none border border-surface-highlight/85 focus:border-spotify-green focus:bg-surface/30 transition-all placeholder:text-subtext/50"
                        />
                        {trackSearchQ && (
                          <button
                            onClick={() => setTrackSearchQ('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-subtext hover:text-primary"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>

                      {/* Display results as a beautiful grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-56 overflow-y-auto pr-1">
                        {(() => {
                          const source = allLibraryTracks.length > 0 ? allLibraryTracks : myTracks
                          const q = trackSearchQ.toLowerCase()
                          const filtered = source.filter(t =>
                            t.title.toLowerCase().includes(q) ||
                            (t.artist_name || '').toLowerCase().includes(q)
                          )

                          if (loadingLibraryTracks) {
                            return (
                              <div className="col-span-full py-8 flex flex-col items-center justify-center gap-2 text-subtext">
                                <div className="w-5 h-5 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs">Fetching tracks…</span>
                              </div>
                            )
                          }
                          if (filtered.length === 0) {
                            return (
                              <div className="col-span-full py-8 text-center text-xs text-subtext border border-dashed border-surface-highlight/30 rounded-lg">
                                {trackSearchQ ? `No tracks matching "${trackSearchQ}"` : 'Library is empty.'}
                              </div>
                            )
                          }

                          return filtered.map(t => {
                            const isSelected = studioSelectedTrackId === t.id
                            return (
                              <div
                                key={t.id}
                                onClick={() => handleAttachAppTrack(t.id)}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${isSelected
                                  ? 'bg-spotify-green/10 border-spotify-green text-spotify-green shadow'
                                  : 'bg-surface border-surface-highlight/30 hover:bg-surface-highlight/10 text-primary'
                                  }`}
                              >
                                {t.cover_url ? (
                                  <img src={t.cover_url} alt={t.title} className="w-9 h-9 rounded object-cover shrink-0 shadow-sm" />
                                ) : (
                                  <div className="w-9 h-9 rounded bg-surface-highlight/40 flex items-center justify-center shrink-0 border border-surface-highlight/30">
                                    <Music size={14} className="text-subtext" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-xs font-bold truncate text-primary">{t.title}</h4>
                                  <p className="text-[10px] text-subtext truncate">{t.artist_name || 'Single'}</p>
                                </div>
                                {isSelected ? (
                                  <CheckCircle size={15} className="text-spotify-green shrink-0" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border border-surface-highlight/40 shrink-0" />
                                )}
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  )}

                  {/* ── Option B: External File Upload ── */}
                  {studioBackingSource === 'external' && (
                    <div className="flex items-center gap-4 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-highlight/20 border border-surface-highlight text-xs font-bold text-primary hover:bg-surface-highlight/40 cursor-pointer shadow-sm transition-all active:scale-95">
                        <Upload size={13} />
                        {studioExternalFileName ? 'Change Audio File' : 'Choose Local File'}
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleAttachExternalTrack(f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {studioExternalFileName ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-spotify-green/10 border border-spotify-green/20 text-xs text-spotify-green font-semibold">
                          <FileAudio size={13} />
                          <span className="truncate max-w-[250px]">{studioExternalFileName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-subtext">Supports WAV, MP3, M4A, FLAC</span>
                      )}
                    </div>
                  )}

                  {/* ── Common AI Split Control Area ── */}
                  {studioBackingSource !== 'none' && (studioSelectedTrackId || studioExternalFileName) && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-surface-highlight/10 border border-surface-highlight/20 mt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-subtext uppercase tracking-widest mb-0.5">2. Stem Separation</span>
                        <p className="text-xs text-subtext">
                          {isSplit
                            ? 'Accompaniment layers have been extracted and loaded in the mixer.'
                            : 'Process the backing track using Demucs AI to isolate vocals, drums, bass, and instrumentals.'}
                        </p>
                      </div>
                      <button
                        onClick={handleSplitBackingTrack}
                        disabled={isSplitting || isSplit}
                        className={`flex items-center gap-2 px-4.5 py-2.5 rounded-md text-xs font-bold shadow transition-all shrink-0 ${isSplit
                          ? 'bg-surface-highlight/30 border border-surface-highlight/40 text-subtext cursor-default'
                          : 'bg-spotify-green text-accent-text hover:brightness-110 active:scale-95'
                          } disabled:opacity-50 disabled:pointer-events-none`}
                      >
                        <Disc2 size={13} className={isSplitting ? 'animate-spin' : ''} />
                        {isSplitting ? 'Separating Stems…' : isSplit ? 'Separation Complete' : 'Split Track into Layers'}
                      </button>
                    </div>
                  )}

                  {/* separation progress animation card */}
                  {isSplitting && (
                    <div className="flex items-center gap-4.5 p-5 rounded-xl bg-surface-highlight/10 border border-surface-highlight/20 animate-pulse">
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 border-3 border-spotify-green/20 border-t-spotify-green rounded-full animate-spin" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-primary">Separating Audio Tracks</h4>
                        <p className="text-[11px] text-subtext">
                          It takes around 30 to 90 seconds depending on the audio duration.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section: Multi-Track Mixer Console ── */}
              <div className="px-6 py-6 bg-surface text-primary">
                {/* Mixer Section Header */}
                <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-surface-highlight/25">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">Mixer Board</span>
                    <span className="text-xs text-subtext/40 font-medium">|</span>
                    <span className="text-[10px] text-subtext font-mono tracking-wide truncate max-w-[200px] bg-surface-highlight/10 px-2 py-0.5 rounded border border-surface-highlight/30">
                      {studioExternalFileName || (studioSelectedTrackId
                        ? (allLibraryTracks.length > 0 ? allLibraryTracks : myTracks).find(t => t.id === studioSelectedTrackId)?.title
                        : 'Pure Vocal Session')}
                    </span>
                  </div>
                  <div className="px-3 py-1 rounded bg-surface-highlight/20 border border-surface-highlight/30 font-mono text-xs text-spotify-green font-extrabold select-none tracking-widest shadow-inner tabular-nums">
                    {formatMixerTime(mixerTime)}
                  </div>
                </div>

                {/* Multitrack Stack */}
                <div className="space-y-3">
                  {/* Track 1: Backing Instrumental / Music Track */}
                  {studioBackingSource !== 'none' && isSplit && (
                    <div className="flex items-center h-20 rounded-lg overflow-hidden border border-surface-highlight/20 bg-surface-highlight/5">
                      {/* Track Control Strip */}
                      <div className="w-36 shrink-0 h-full flex flex-col justify-between p-2.5 bg-surface-elevated/60 border-r border-surface-highlight/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold tracking-wider" style={{ color: '#00E676' }}>MUSIC</span>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setStudioMutes(prev => ({ ...prev, music: !prev.music }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes.music
                                ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Mute Music"
                            >
                              M
                            </button>
                            <button
                              onClick={() => setStudioSolos(prev => ({ ...prev, music: !prev.music }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos.music
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Solo Music"
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <VolumeWedge value={studioVolumes.music} onChange={(val) => setStudioVolumes(prev => ({ ...prev, music: val }))} />
                      </div>
                      {/* Timeline Waveform */}
                      <div className="flex-1 h-full bg-surface-highlight/10 relative cursor-pointer">
                        <WaveformTrack audioUrl={backingKeys?.split_other_key} color="#00E676" height={78} currentTime={mixerTime} duration={mixerDuration} onTimeUpdate={handleSeek} />
                        {mixerDuration > 0 && (
                          <div className="absolute top-0 h-full w-[1.5px] bg-primary pointer-events-none z-10 opacity-70" style={{ left: `${(mixerTime / mixerDuration) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track: Original Vocal Track */}
                  {studioBackingSource !== 'none' && isSplit && (
                    <div className="flex items-center h-20 rounded-lg overflow-hidden border border-surface-highlight/20 bg-surface-highlight/5">
                      {/* Track Control Strip */}
                      <div className="w-36 shrink-0 h-full flex flex-col justify-between p-2.5 bg-surface-elevated/60 border-r border-surface-highlight/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold tracking-wider" style={{ color: '#00E5FF' }}>ORIGINAL VOCAL</span>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setStudioMutes(prev => ({ ...prev, backingVocal: !prev.backingVocal }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes.backingVocal
                                ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Mute Original Vocals"
                            >
                              M
                            </button>
                            <button
                              onClick={() => setStudioSolos(prev => ({ ...prev, backingVocal: !prev.backingVocal }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos.backingVocal
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Solo Original Vocals"
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <VolumeWedge value={studioVolumes.backingVocal} onChange={(val) => setStudioVolumes(prev => ({ ...prev, backingVocal: val }))} />
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={recordOriginalVocal}
                              onChange={(e) => setRecordOriginalVocal(e.target.checked)}
                              className="w-3 h-3 rounded border-surface-highlight/40 text-spotify-green focus:ring-0 bg-transparent"
                            />
                            <span className="text-[8px] text-subtext font-semibold uppercase tracking-wider">Rec Enable</span>
                          </label>
                        </div>
                      </div>
                      {/* Timeline Waveform */}
                      <div className="flex-1 h-full bg-surface-highlight/10 relative cursor-pointer">
                        <WaveformTrack audioUrl={backingKeys?.split_vocals_key} color="#00E5FF" height={78} currentTime={mixerTime} duration={mixerDuration} onTimeUpdate={handleSeek} />
                        {mixerDuration > 0 && (
                          <div className="absolute top-0 h-full w-[1.5px] bg-primary pointer-events-none z-10 opacity-70" style={{ left: `${(mixerTime / (mixerDuration || 1)) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track 2: Vocal Track (Main track, always available) */}
                  <div className="flex items-center h-20 rounded-lg overflow-hidden border border-surface-highlight/20 bg-surface-highlight/5">
                    {/* Track Control Strip */}
                    <div className="w-36 shrink-0 h-full flex flex-col justify-between p-2.5 bg-surface-elevated/60 border-r border-surface-highlight/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold tracking-wider" style={{ color: '#a78bfa' }}>MY VOCAL</span>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setStudioMutes(prev => ({ ...prev, vocal: !prev.vocal }))}
                            className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes.vocal
                              ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black'
                              : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                              }`}
                            title="Mute Vocals"
                          >
                            M
                          </button>
                          <button
                            onClick={() => setStudioSolos(prev => ({ ...prev, vocal: !prev.vocal }))}
                            className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos.vocal
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black'
                              : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                              }`}
                            title="Solo Vocals"
                          >
                            S
                          </button>
                        </div>
                      </div>
                      <VolumeWedge value={studioVolumes.vocal} onChange={(val) => setStudioVolumes(prev => ({ ...prev, vocal: val }))} />
                    </div>
                    {/* Timeline Waveform */}
                    <div className="flex-1 h-full bg-surface-highlight/10 relative cursor-pointer">
                      <WaveformTrack audioUrl={vocalUrl} color="#a78bfa" height={78} currentTime={mixerTime} duration={mixerDuration} onTimeUpdate={handleSeek} />
                      {mixerDuration > 0 && (
                        <div className="absolute top-0 h-full w-[1.5px] bg-primary pointer-events-none z-10 opacity-70" style={{ left: `${(mixerTime / mixerDuration) * 100}%` }} />
                      )}
                    </div>
                  </div>

                  {/* Track 3: Bass Track */}
                  {studioBackingSource !== 'none' && isSplit && (
                    <div className="flex items-center h-20 rounded-lg overflow-hidden border border-surface-highlight/20 bg-surface-highlight/5">
                      {/* Track Control Strip */}
                      <div className="w-36 shrink-0 h-full flex flex-col justify-between p-2.5 bg-surface-elevated/60 border-r border-surface-highlight/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold tracking-wider" style={{ color: '#ffd600' }}>BASS</span>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setStudioMutes(prev => ({ ...prev, bass: !prev.bass }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes.bass
                                ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Mute Bass"
                            >
                              M
                            </button>
                            <button
                              onClick={() => setStudioSolos(prev => ({ ...prev, bass: !prev.bass }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos.bass
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Solo Bass"
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <VolumeWedge value={studioVolumes.bass} onChange={(val) => setStudioVolumes(prev => ({ ...prev, bass: val }))} />
                      </div>
                      {/* Timeline Waveform */}
                      <div className="flex-1 h-full bg-surface-highlight/10 relative cursor-pointer">
                        <WaveformTrack audioUrl={backingKeys?.split_bass_key} color="#ffd600" height={78} currentTime={mixerTime} duration={mixerDuration} onTimeUpdate={handleSeek} />
                        {mixerDuration > 0 && (
                          <div className="absolute top-0 h-full w-[1.5px] bg-primary pointer-events-none z-10 opacity-70" style={{ left: `${(mixerTime / mixerDuration) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track 4: Drums Track */}
                  {studioBackingSource !== 'none' && isSplit && (
                    <div className="flex items-center h-20 rounded-lg overflow-hidden border border-surface-highlight/20 bg-surface-highlight/5">
                      {/* Track Control Strip */}
                      <div className="w-36 shrink-0 h-full flex flex-col justify-between p-2.5 bg-surface-elevated/60 border-r border-surface-highlight/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold tracking-wider" style={{ color: '#ff1744' }}>DRUMS</span>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setStudioMutes(prev => ({ ...prev, drums: !prev.drums }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes.drums
                                ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Mute Drums"
                            >
                              M
                            </button>
                            <button
                              onClick={() => setStudioSolos(prev => ({ ...prev, drums: !prev.drums }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos.drums
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Solo Drums"
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <VolumeWedge value={studioVolumes.drums} onChange={(val) => setStudioVolumes(prev => ({ ...prev, drums: val }))} />
                      </div>
                      {/* Timeline Waveform */}
                      <div className="flex-1 h-full bg-surface-highlight/10 relative cursor-pointer">
                        <WaveformTrack audioUrl={backingKeys?.split_drums_key} color="#ff1744" height={78} currentTime={mixerTime} duration={mixerDuration} onTimeUpdate={handleSeek} />
                        {mixerDuration > 0 && (
                          <div className="absolute top-0 h-full w-[1.5px] bg-primary pointer-events-none z-10 opacity-70" style={{ left: `${(mixerTime / mixerDuration) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track 5: Guitar Track */}
                  {studioBackingSource !== 'none' && isSplit && (
                    <div className="flex items-center h-20 rounded-lg overflow-hidden border border-surface-highlight/20 bg-surface-highlight/5">
                      {/* Track Control Strip */}
                      <div className="w-36 shrink-0 h-full flex flex-col justify-between p-2.5 bg-surface-elevated/60 border-r border-surface-highlight/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold tracking-wider" style={{ color: '#ff9100' }}>GUITAR</span>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setStudioMutes(prev => ({ ...prev, guitar: !prev.guitar }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes.guitar
                                ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Mute Guitar"
                            >
                              M
                            </button>
                            <button
                              onClick={() => setStudioSolos(prev => ({ ...prev, guitar: !prev.guitar }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos.guitar
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Solo Guitar"
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <VolumeWedge value={studioVolumes.guitar} onChange={(val) => setStudioVolumes(prev => ({ ...prev, guitar: val }))} />
                      </div>
                      {/* Timeline Waveform */}
                      <div className="flex-1 h-full bg-surface-highlight/10 relative cursor-pointer">
                        <WaveformTrack audioUrl={backingKeys?.split_guitar_key} color="#ff9100" height={78} currentTime={mixerTime} duration={mixerDuration} onTimeUpdate={handleSeek} />
                        {mixerDuration > 0 && (
                          <div className="absolute top-0 h-full w-[1.5px] bg-primary pointer-events-none z-10 opacity-70" style={{ left: `${(mixerTime / mixerDuration) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Track 6: Piano Track */}
                  {studioBackingSource !== 'none' && isSplit && (
                    <div className="flex items-center h-20 rounded-lg overflow-hidden border border-surface-highlight/20 bg-surface-highlight/5">
                      {/* Track Control Strip */}
                      <div className="w-36 shrink-0 h-full flex flex-col justify-between p-2.5 bg-surface-elevated/60 border-r border-surface-highlight/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold tracking-wider" style={{ color: '#2979ff' }}>PIANO</span>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setStudioMutes(prev => ({ ...prev, piano: !prev.piano }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes.piano
                                ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Mute Piano"
                            >
                              M
                            </button>
                            <button
                              onClick={() => setStudioSolos(prev => ({ ...prev, piano: !prev.piano }))}
                              className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos.piano
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black'
                                : 'bg-surface-highlight/20 border-surface-highlight text-subtext hover:text-primary'
                                }`}
                              title="Solo Piano"
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <VolumeWedge value={studioVolumes.piano} onChange={(val) => setStudioVolumes(prev => ({ ...prev, piano: val }))} />
                      </div>
                      {/* Timeline Waveform */}
                      <div className="flex-1 h-full bg-surface-highlight/10 relative cursor-pointer">
                        <WaveformTrack audioUrl={backingKeys?.split_piano_key} color="#2979ff" height={78} currentTime={mixerTime} duration={mixerDuration} onTimeUpdate={handleSeek} />
                        {mixerDuration > 0 && (
                          <div className="absolute top-0 h-full w-[1.5px] bg-primary pointer-events-none z-10 opacity-70" style={{ left: `${(mixerTime / mixerDuration) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Mixer Transport & Recording Dashboard ── */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 mt-4 border-t border-surface-highlight/25">
                  {/* Left Side: Playback controls */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={stopMixer}
                      className="p-2.5 rounded-lg bg-surface-highlight/25 border border-surface-highlight/50 text-subtext hover:text-primary transition-colors active:scale-95 shadow-sm"
                      title="Stop & Rewind to Start"
                    >
                      <Square size={13} fill="currentColor" />
                    </button>
                    <button
                      onClick={isPlayingMix ? pauseMixer : playMixer}
                      className="p-3 rounded-full bg-spotify-green text-accent-text hover:brightness-110 shadow transition-all active:scale-90 flex items-center justify-center w-11 h-11 shrink-0"
                      title={isPlayingMix ? 'Pause Mixer' : 'Play Mixer'}
                    >
                      {isPlayingMix ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <div className="flex flex-col text-left">
                      <span className="text-[9px] text-subtext font-bold uppercase tracking-wider">Timeline Position</span>
                      <span className="text-xs font-mono text-primary font-bold tabular-nums">
                        {formatMixerTime(mixerTime)} <span className="text-subtext/40">/</span> {formatMixerTime(mixerDuration)}
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Recording trigger buttons */}
                  <div className="flex items-center gap-2">
                    {isRecording ? (
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 text-white text-xs font-bold shadow transition-colors hover:bg-red-700 active:scale-95 shrink-0"
                      >
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                        Finish Recording
                      </button>
                    ) : (
                      <button
                        onClick={startRecording}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#7c4dff] text-white text-xs font-bold shadow hover:bg-[#683bdf] transition-all hover:scale-[1.02] active:scale-95 shrink-0"
                      >
                        <Mic size={13} />
                        Record Vocal Layer
                      </button>
                    )}
                  </div>
                </div>

                {/* Simulated Oscilloscope overlay during active recording */}
                {isRecording && (
                  <div className="absolute inset-0 bg-surface/90 flex flex-col items-center justify-center z-20 gap-4 rounded-xl border border-red-500/20 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full bg-red-500 animate-ping shrink-0" />
                      <p className="text-sm font-bold text-red-500 uppercase tracking-widest animate-pulse">Recording Vocal track...</p>
                    </div>
                    {/* Retro waveform bars */}
                    <div className="flex items-end gap-1.5 h-12">
                      {[6, 12, 22, 32, 16, 26, 10, 20, 8].map((h, i) => (
                        <div
                          key={i}
                          className="w-1.5 bg-red-500 rounded-full animate-bounce"
                          style={{
                            height: `${h}px`,
                            animationDuration: '0.6s',
                            animationDelay: `${i * 80}ms`
                          }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={stopRecording}
                      className="px-6 py-2 rounded-full bg-surface border border-surface-highlight text-xs font-bold text-primary hover:bg-surface-highlight/30 transition-colors shadow active:scale-95"
                    >
                      Finish & Compile Mix
                    </button>
                  </div>
                )}
              </div>

              {/* ── Section: Song Lyrics (When Available) ── */}
              {(() => {
                const selectedTrack = (allLibraryTracks.length > 0 ? allLibraryTracks : myTracks).find(t => t.id === studioSelectedTrackId)
                if (!selectedTrack?.lyrics) return null
                return (
                  <div className="px-6 py-5 bg-surface-elevated/10 border-b border-surface-highlight/20 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">Song Lyrics</span>
                      <div className="h-px flex-1 bg-surface-highlight/20" />
                    </div>
                    <div className="bg-surface-elevated/40 border border-surface-highlight/25 rounded-lg p-5 max-h-60 overflow-y-auto font-sans text-sm text-subtext leading-relaxed whitespace-pre-line hover:border-surface-highlight/40 transition-colors shadow-inner">
                      {selectedTrack.lyrics}
                    </div>
                  </div>
                )
              })()}

              {/* ── Section: Saved Recording Drafts list ── */}
              <div className="px-6 py-5 bg-surface-elevated/20 space-y-4.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">Saved Recording Drafts</span>
                    <div className="h-px w-6 bg-surface-highlight/20" />
                  </div>
                  <span className="text-[10px] text-subtext font-bold bg-surface px-2 py-0.5 rounded border border-surface-highlight/40">{myDrafts.length} drafts</span>
                </div>

                {myDrafts.length === 0 ? (
                  <div className="py-12 text-center text-subtext border border-dashed border-surface-highlight/40 rounded-xl bg-surface-highlight/10 text-xs font-medium">
                    No drafts saved in workspace yet. Record your vocal tracks and click "Save Draft" to keep your work.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {myDrafts.map(d => {
                      const isLoaded = selectedDraftId === d.id
                      const backing = d.backing_track_id
                        ? ((allLibraryTracks.length > 0 ? allLibraryTracks : myTracks).find(t => t.id === d.backing_track_id)?.title || `Track #${d.backing_track_id}`)
                        : (d.backing_file_key ? d.backing_file_key.split('/').pop() : 'Vocal Only')

                      return (
                        <div
                          key={d.id}
                          onClick={() => handleSelectDraft(d)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 text-left ${isLoaded
                            ? 'bg-spotify-green/10 border-spotify-green/40 shadow-sm'
                            : 'bg-surface border-surface-highlight/30 hover:bg-surface-highlight/10'
                            }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-bold text-sm text-primary truncate flex-1">{d.title}</h4>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-subtext">
                              <FileAudio size={12} className="text-subtext shrink-0" />
                              <span className="truncate">Backing: <span className="text-primary font-semibold">{backing}</span></span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                {d.is_split && (
                                  <span className="px-1.5 py-0.5 rounded bg-spotify-green/10 text-spotify-green text-[9px] font-bold border border-spotify-green/20">STEMS</span>
                                )}
                                <span className="px-1.5 py-0.5 rounded bg-surface-highlight/40 text-subtext text-[9px] font-bold border border-surface-highlight/30">DRAFT</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-[10px] text-subtext font-medium pt-2 border-t border-surface-highlight/10">
                              <div className="flex flex-col">
                                <span className="text-[8px] uppercase tracking-wider text-subtext/60">Created</span>
                                <span className="font-mono text-primary/85 mt-0.5">
                                  {new Date(d.created_at).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[8px] uppercase tracking-wider text-subtext/60">Last Updated</span>
                                <span className="font-mono text-primary/85 mt-0.5">
                                  {new Date(d.updated_at).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-surface-highlight/20 pt-3 mt-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleSelectDraft(d)}
                              className={`px-3 py-1.5 rounded-md text-[10px] font-bold border shadow-sm transition-all active:scale-95 ${isLoaded
                                ? 'bg-spotify-green/10 border-spotify-green/30 text-spotify-green'
                                : 'bg-surface-highlight/40 border-surface-highlight text-primary hover:bg-surface-highlight/60'
                                }`}
                            >
                              {isLoaded ? 'Reload' : 'Load Session'}
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => handleOpenPublishModal(d.id, e)}
                                className="px-3.5 py-1.5 rounded-md text-[10px] font-bold bg-spotify-green text-accent-text hover:brightness-110 shadow transition-all active:scale-95"
                              >
                                Publish Song
                              </button>
                              <button
                                onClick={() => handleDeleteDraft(d.id)}
                                className="p-2 rounded-md bg-surface border border-surface-highlight/40 text-subtext hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/5 transition-colors"
                                title="Delete Draft"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {activeTab === 'edit' && selectedDraftId && (
        <div className="px-6 pb-12 animate-in fade-in duration-200">
          <div className="flex flex-col text-left text-primary min-h-[600px] bg-surface rounded-xl overflow-hidden border border-surface-highlight/30 shadow divide-y divide-surface-highlight/25 font-sans">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 bg-surface-elevated/40 border-b border-surface-highlight/10">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-surface-highlight/20 border border-surface-highlight/30 text-spotify-green shadow-inner shrink-0">
                  <Sliders size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-primary">Audio Editor</h3>
                  <p className="text-[11px] text-subtext mt-0.5">
                    Fine-tune, trim, align delay, adjust stems, and change accompaniment backing tracks.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDraft}
                  className="px-4 py-2 rounded-full bg-surface-highlight/30 hover:bg-surface-highlight/60 border border-surface-highlight/80 text-xs font-bold transition-all shadow-sm"
                >
                  Save Changes
                </button>
                <button
                  onClick={(e) => handleOpenPublishModal(selectedDraftId, e)}
                  className="px-4 py-2 rounded-full bg-spotify-green text-accent-text text-xs font-bold hover:bg-spotify-green-hover transition-all shadow-md"
                >
                  Publish Mix
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-surface-highlight/25">
              {/* Left side: Controls (7 cols) */}
              <div className="lg:col-span-7 p-6 space-y-6">
                
                {/* 1. Vocal Track Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">My Vocal Alignment</span>
                    <div className="h-px flex-1 bg-surface-highlight/20" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Vocal Alignment Delay */}
                    <div className="p-4 rounded-xl border border-surface-highlight/20 bg-surface-highlight/5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>Delay Offset</span>
                        <span className="font-mono text-spotify-green">{vocalOffset.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.05"
                        value={vocalOffset}
                        onChange={(e) => setVocalOffset(Number(e.target.value))}
                        className="w-full h-1 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-spotify-green"
                      />
                      <p className="text-[10px] text-subtext leading-relaxed">
                        Delay the vocal track start to align with the backing beat.
                      </p>
                    </div>

                    {/* Vocal Trim Controls */}
                    <div className="p-4 rounded-xl border border-surface-highlight/20 bg-surface-highlight/5 space-y-3">
                      <span className="text-xs font-bold block">Vocal Track Trimming</span>
                      
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <label className="block text-subtext font-semibold mb-1">Trim Start (sec)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={vocalTrimStart}
                            onChange={(e) => setVocalTrimStart(Math.max(0, Number(e.target.value)))}
                            className="w-full px-2 py-1 rounded bg-surface-highlight outline-none text-primary border border-surface-highlight/85 text-center font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-subtext font-semibold mb-1">Trim End (sec)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={vocalTrimEnd}
                            onChange={(e) => setVocalTrimEnd(Math.max(0, Number(e.target.value)))}
                            className="w-full px-2 py-1 rounded bg-surface-highlight outline-none text-primary border border-surface-highlight/85 text-center font-mono"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-subtext leading-relaxed">
                        Set trim boundaries. Enter 0 for Trim End to disable trimming the end.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Backing Track Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">Backing Track Trimming</span>
                    <div className="h-px flex-1 bg-surface-highlight/20" />
                  </div>

                  <div className="p-4 rounded-xl border border-surface-highlight/20 bg-surface-highlight/5 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                      <div>
                        <label className="block text-subtext font-semibold mb-1">Trim Start (sec)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={backingTrimStart}
                          onChange={(e) => setBackingTrimStart(Math.max(0, Number(e.target.value)))}
                          className="w-full px-2.5 py-1 rounded bg-surface-highlight outline-none text-primary border border-surface-highlight/85 text-center font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-subtext font-semibold mb-1">Trim End (sec)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={backingTrimEnd}
                          onChange={(e) => setBackingTrimEnd(Math.max(0, Number(e.target.value)))}
                          className="w-full px-2.5 py-1 rounded bg-surface-highlight outline-none text-primary border border-surface-highlight/85 text-center font-mono text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-subtext leading-relaxed">
                      Applies to the accompaniment stems/track. Enter 0 for Trim End to use the full remaining duration.
                    </p>
                  </div>
                </div>

                {/* 3. Backing Track Accompaniment Source Picker (Edit mode) */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">Change Backing Track</span>
                    <div className="h-px flex-1 bg-surface-highlight/20" />
                  </div>

                  <div className="p-5 rounded-xl border border-surface-highlight/20 bg-surface-highlight/5 space-y-4">
                    {/* Source Toggle */}
                    <div className="flex bg-surface-highlight/25 p-1 rounded-lg w-fit border border-surface-highlight/45">
                      <button
                        onClick={() => {
                          setStudioBackingSource('none')
                          setStudioSelectedTrackId(null)
                          setStudioExternalFile(null)
                          setStudioExternalFileName('')
                          setBackingFileKey(null)
                          setIsSplit(false)
                          setBackingKeys(null)
                        }}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${studioBackingSource === 'none' ? 'bg-surface text-spotify-green shadow-sm' : 'text-subtext hover:text-primary'}`}
                      >
                        Vocal Only
                      </button>
                      <button
                        onClick={() => {
                          setStudioBackingSource('app')
                        }}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${studioBackingSource === 'app' ? 'bg-surface text-spotify-green shadow-sm' : 'text-subtext hover:text-primary'}`}
                      >
                        From Library
                      </button>
                      <button
                        onClick={() => setStudioBackingSource('external')}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${studioBackingSource === 'external' ? 'bg-surface text-spotify-green shadow-sm' : 'text-subtext hover:text-primary'}`}
                      >
                        Upload File
                      </button>
                    </div>

                    {/* Source-specific picker */}
                    {studioBackingSource === 'app' && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={trackSearchQ}
                          onChange={(e) => setTrackSearchQ(e.target.value)}
                          placeholder="Search library backing tracks..."
                          className="w-full bg-surface-highlight/30 text-xs text-primary px-3 py-2 rounded-lg outline-none border border-surface-highlight/85 focus:border-spotify-green transition-all"
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {(() => {
                            const source = allLibraryTracks.length > 0 ? allLibraryTracks : myTracks
                            const q = trackSearchQ.toLowerCase()
                            const filtered = source.filter(t => t.title.toLowerCase().includes(q))
                            return filtered.map(t => {
                              const isSel = studioSelectedTrackId === t.id
                              return (
                                <div
                                  key={t.id}
                                  onClick={() => handleAttachAppTrack(t.id)}
                                  className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${isSel ? 'bg-spotify-green/10 border-spotify-green text-spotify-green' : 'bg-surface border-surface-highlight/30 hover:bg-surface-highlight/10 text-primary'}`}
                                >
                                  <span className="font-bold truncate">{t.title}</span>
                                  {isSel && <CheckCircle size={13} />}
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                    )}

                    {studioBackingSource === 'external' && (
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-highlight/30 border border-surface-highlight text-xs font-bold text-primary hover:bg-surface-highlight/50 cursor-pointer shadow-sm">
                          <Upload size={12} />
                          {studioExternalFileName ? 'Change File' : 'Choose Local File'}
                          <input
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleAttachExternalTrack(file)
                            }}
                          />
                        </label>
                        {studioExternalFileName && (
                          <span className="text-xs text-subtext truncate max-w-xs font-mono bg-surface-highlight/20 px-2 py-0.5 rounded border border-surface-highlight/30">
                            {studioExternalFileName}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Separation Trigger when a track is attached but not yet split */}
                    {studioBackingSource !== 'none' && !isSplit && (
                      <div className="pt-2 border-t border-surface-highlight/20 flex items-center justify-between gap-4">
                        <p className="text-[10px] text-subtext">
                          For professional multi-track stem controls (Vocal, Drums, Bass, Piano, Guitar, Music), split the backing track.
                        </p>
                        <button
                          onClick={handleSplitBackingTrack}
                          disabled={isSplitting}
                          className="px-4 py-1.5 rounded-full bg-spotify-green text-accent-text text-xs font-bold hover:bg-spotify-green-hover transition-all shrink-0 active:scale-95 disabled:opacity-55"
                        >
                          Split Backing Track
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Right side: Stem Stack & Real-time Live Volume Sliders (5 cols) */}
              <div className="lg:col-span-5 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-subtext uppercase tracking-widest">Live Mix Balance</span>
                  <div className="h-px flex-1 bg-surface-highlight/20" />
                </div>

                <div className="bg-surface-highlight/10 p-4 rounded-xl border border-surface-highlight/20 space-y-4 shadow-inner">
                  
                  {/* Mixer Volume wedges stack */}
                  <div className="space-y-4">
                    {ALL_MIXER_KEYS.map((key) => {
                      // Skip rendering stems that aren't split if backing track is not split
                      if (!isSplit && key !== 'vocal' && key !== 'music') return null
                      if (studioBackingSource === 'none' && key !== 'vocal') return null

                      const label = key === 'vocal' ? 'MY VOCAL'
                                  : key === 'backingVocal' ? 'ORIGINAL VOCAL'
                                  : key.toUpperCase()

                      const color = key === 'vocal' ? '#a78bfa'
                                  : key === 'backingVocal' ? '#00E5FF'
                                  : key === 'music' ? '#00E676'
                                  : key === 'bass' ? '#ffd600'
                                  : key === 'drums' ? '#ff1744'
                                  : key === 'guitar' ? '#ff9100'
                                  : '#2979ff'

                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-extrabold" style={{ color }}>
                            <span>{label}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setStudioMutes(prev => ({ ...prev, [key]: !prev[key] }))}
                                className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioMutes[key] ? 'bg-red-500/10 border-red-500/30 text-red-500 font-black' : 'bg-surface-highlight/40 border-surface-highlight/65 text-subtext'}`}
                              >
                                M
                              </button>
                              <button
                                onClick={() => setStudioSolos(prev => ({ ...prev, [key]: !prev[key] }))}
                                className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${studioSolos[key] ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black' : 'bg-surface-highlight/40 border-surface-highlight/65 text-subtext'}`}
                              >
                                S
                              </button>
                            </div>
                          </div>
                          <VolumeWedge
                            value={studioVolumes[key] ?? 1.0}
                            onChange={(val) => setStudioVolumes(prev => ({ ...prev, [key]: val }))}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Audio Element Playback Controls for Editor */}
                <div className="p-4 rounded-xl border border-surface-highlight/20 bg-surface-highlight/5 flex flex-col items-center gap-3">
                  <div className="flex items-center justify-between w-full text-xs font-mono font-bold text-subtext select-none">
                    <span>{formatMixerTime(mixerTime)}</span>
                    <span>/</span>
                    <span>{formatMixerTime(mixerDuration)}</span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <button
                      onClick={isPlayingMix ? pauseMixer : playMixer}
                      className="w-10 h-10 rounded-full bg-spotify-green text-accent-text flex items-center justify-center hover:scale-105 active:scale-95 shadow transition-all"
                    >
                      {isPlayingMix ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button
                      onClick={() => handleSeek(0)}
                      className="p-2 rounded-full border border-surface-highlight/40 text-subtext hover:text-primary hover:bg-surface-highlight/30 transition-colors active:scale-95"
                      title="Rewind to Start"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>

                  <p className="text-[10px] text-center text-subtext/60 leading-normal">
                    Use the playback controls to listen to your edits, volume levels, and delay offset adjustments in real time before publishing.
                  </p>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}



      {/* DRAFT PUBLISH MODAL */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handlePublishSubmit}
            className="bg-surface-elevated rounded-xl p-6 w-full max-w-md shadow-2xl border border-surface-highlight space-y-4 text-left text-white animate-in fade-in zoom-in-95 duration-150"
          >
            <h2 className="text-lg font-bold text-primary flex items-center gap-1.5">
              <Globe size={20} className="text-spotify-green animate-pulse" />
              Publish Recorded Song
            </h2>
            <p className="text-xs text-subtext">This will compile your vocals and backing tracks into a final mixed master track, transcode it to HLS, and publish it as a track.</p>

            <div>
              <label className="block text-xs font-semibold text-subtext uppercase tracking-wider mb-1">Song Title</label>
              <input
                type="text"
                required
                value={publishTitle}
                onChange={(e) => setPublishTitle(e.target.value)}
                placeholder="e.g. My Masterpiece"
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-subtext uppercase tracking-wider mb-1">Album (Optional)</label>
              <select
                value={publishAlbumId || ''}
                onChange={(e) => setPublishAlbumId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border border-surface-highlight focus:border-spotify-green/50 transition-colors"
              >
                <option value="">-- None (Single Track) --</option>
                {myAlbums.map(al => (
                  <option key={al.id} value={al.id}>{al.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-subtext uppercase tracking-wider mb-1">Lyrics (Optional)</label>
              <textarea
                value={publishLyrics}
                onChange={(e) => setPublishLyrics(e.target.value)}
                placeholder="Add song lyrics here..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border border-surface-highlight focus:border-spotify-green/50 transition-colors resize-none"
              />
            </div>

            {/* Cover Image Picker */}
            <div>
              <label className="block text-xs font-semibold text-subtext uppercase tracking-wider mb-1">
                Cover Photo (Required)
              </label>
              <div
                onClick={() => publishCoverInputRef.current?.click()}
                className="relative aspect-square w-full max-h-48 mx-auto rounded-xl border-2 border-dashed border-surface-highlight hover:border-spotify-green/50 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden group bg-surface-highlight/20 shadow-md"
              >
                {publishCoverPreview ? (
                  <>
                    <img
                      src={publishCoverPreview}
                      alt="Cover Preview"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-medium gap-1.5 p-4 text-center backdrop-blur-[2px]">
                      <ImageIcon size={20} />
                      <span>Change cover photo</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-subtext hover:text-primary transition-colors p-4 text-center">
                    <ImageIcon size={28} />
                    <span className="text-xs font-medium">Click to select cover image</span>
                    <span className="text-[10px] text-subtext/70">Square PNG or JPG</span>
                  </div>
                )}
                <input
                  ref={publishCoverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      openImageCropper(file, (croppedFile) => {
                        setPublishCoverFile(croppedFile)
                        setPublishCoverPreview(URL.createObjectURL(croppedFile))
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
                onClick={() => setPublishModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-surface-highlight text-sm font-medium hover:bg-surface-highlight transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-accent-text text-sm font-semibold hover:bg-spotify-green-hover transition-colors flex items-center justify-center gap-1.5"
              >
                <Globe size={14} />
                Compile & Publish
              </button>
            </div>
          </form>
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
        artistId={myArtist?.id}
        disableArtistSelect={true}
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
                className="flex-1 px-4 py-2.5 rounded-full bg-spotify-green text-accent-text text-sm font-semibold hover:bg-spotify-green-hover transition-colors"
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

      {workingMessage && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm text-white space-y-4">
          <div className="w-12 h-12 border-4 border-spotify-green border-t-transparent rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1 text-center px-4">
            <h3 className="font-bold text-lg text-primary">{workingMessage}</h3>
            <p className="text-xs text-subtext">Please do not close this page or refresh the browser.</p>
          </div>
        </div>
      )}
    </div>
  )
}

