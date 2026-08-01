import { useRef, useEffect, useCallback, useState } from 'react'
import { Volume2, VolumeX, Music, Play, Pause } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { getTrackAudioUrl, getTrack } from '@/api/tracks'
import { addRecentlyPlayed, getPlayerState, updatePlayerState } from '@/api/player'
import { useAuthStore } from '@/store/authStore'
import PlayerControls from './PlayerControls'
import Hls from 'hls.js'

class CustomKeyLoader extends (Hls as any).DefaultConfig.loader {
  load(context: any, config: any, callbacks: any) {
    if (context.url && context.url.includes('/key')) {
      console.log('[CustomKeyLoader] Intercepted key request URL:', context.url)
      const activeBase = (
        import.meta.env.VITE_API_BASE ||
        import.meta.env.VITE_API_HOSTED_BASE ||
        window.location.origin
      ).replace(/\/$/, '')
      if (!context.url.startsWith(activeBase)) {
        try {
          const urlObj = new URL(context.url)
          const activeUrlObj = new URL(activeBase)
          urlObj.protocol = activeUrlObj.protocol
          urlObj.host = activeUrlObj.host
          const original = context.url
          context.url = urlObj.toString()
          console.log('[CustomKeyLoader] Rewrote URL from:', original, 'to:', context.url)
        } catch (err) {
          const pathStart = context.url.indexOf('/tracks/')
          if (pathStart !== -1) {
            const original = context.url
            context.url = activeBase + context.url.substring(pathStart)
            console.log('[CustomKeyLoader] Fallback rewrote URL from:', original, 'to:', context.url)
          }
        }
      } else {
        console.log('[CustomKeyLoader] URL already matches active base. No rewrite needed.')
      }
    }
    super.load(context, config, callbacks)
  }
}

const AUDIO_CACHE = 'fermata-audio-cache-v1'

class CachedFragmentLoader extends (Hls as any).DefaultConfig.loader {
  async load(context: any, config: any, callbacks: any) {
    const isSegment = context.url && context.url.includes('.ts')

    if (isSegment) {
      try {
        const cache = await caches.open(AUDIO_CACHE)
        const cachedResponse = await cache.match(context.url)

        if (cachedResponse) {
          const arrayBuffer = await cachedResponse.arrayBuffer()
          const stats = {
            trequest: performance.now(),
            tfirst: performance.now(),
            tload: performance.now(),
            loaded: arrayBuffer.byteLength,
            total: arrayBuffer.byteLength,
          }
          callbacks.onSuccess({ url: context.url, data: arrayBuffer }, stats, context)
          return
        }
      } catch (err) {
        console.warn('[HLS Cache] Cache lookup failed:', err)
      }
    }

    const originalSuccess = callbacks.onSuccess
    callbacks.onSuccess = async (response: any, stats: any, ctx: any) => {
      if (isSegment) {
        try {
          const cache = await caches.open(AUDIO_CACHE)
          const cacheResponse = new Response(response.data, {
            headers: { 'Content-Type': 'video/mp2t' },
          })
          await cache.put(ctx.url, cacheResponse)
        } catch (err) {
          console.warn('[HLS Cache] Failed to write segment to cache:', err)
        }
      }
      originalSuccess(response, stats, ctx)
    }

    super.load(context, config, callbacks)
  }
}

export default function NowPlayingBar() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const shouldRestoreProgress = useRef(false)
  const isInitialRestoring = useRef(true)
  const [showMobileVolume, setShowMobileVolume] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // --- Web Audio 3D Spatial Audio Refs ---
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const normalGainRef = useRef<GainNode | null>(null)
  const spatialGainRef = useRef<GainNode | null>(null)
  const pannerRef = useRef<PannerNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const convolverRef = useRef<ConvolverNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const eqFiltersRef = useRef<BiquadFilterNode[]>([])
  const preampRef = useRef<GainNode | null>(null)

  const is3DEnabled = usePlayerStore((s) => s.is3DEnabled)
  const is3DReverbEnabled = usePlayerStore((s) => s.is3DReverbEnabled)
  const orbitSpeedSeconds = usePlayerStore((s) => s.orbitSpeedSeconds)
  const orbitHeightPercent = usePlayerStore((s) => s.orbitHeightPercent)
  const eqGains = usePlayerStore((s) => s.eqGains)
  const eqPreamp = usePlayerStore((s) => s.eqPreamp)
  const isEQEnabled = usePlayerStore((s) => s.isEQEnabled)

  const initSpatialEngine = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audioContextRef.current) return

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextClass({ latencyHint: 'interactive' })
      audioContextRef.current = ctx

      // 1. Create Media Source
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source

      // 2. Create Preamp Gain Node (Converts dB to linear multiplier)
      const preamp = ctx.createGain()
      const initialPreampDb = usePlayerStore.getState().eqPreamp
      const activePreamp = usePlayerStore.getState().isEQEnabled ? initialPreampDb : 0
      preamp.gain.value = Math.pow(10, activePreamp / 20)
      preampRef.current = preamp

      // --- Create 10-Band Graphic Equalizer Filter Chain ---
      const bands = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      const filters: BiquadFilterNode[] = []
      const currentGains = usePlayerStore.getState().eqGains
      const active = usePlayerStore.getState().isEQEnabled

      for (let i = 0; i < 10; i++) {
        const filter = ctx.createBiquadFilter()
        if (i === 0) {
          filter.type = 'lowshelf'
        } else if (i === 9) {
          filter.type = 'highshelf'
        } else {
          filter.type = 'peaking'
          filter.Q.value = 1.0
        }
        filter.frequency.value = bands[i]
        filter.gain.value = active ? (currentGains[i] ?? 0) : 0
        filters.push(filter)
      }
      eqFiltersRef.current = filters

      // 3. Normal Path Gain
      const normalGain = ctx.createGain()
      normalGain.gain.value = usePlayerStore.getState().is3DEnabled ? 0.0 : 1.0
      normalGainRef.current = normalGain

      // 4. Spatial Path Gain
      const spatialGain = ctx.createGain()
      spatialGain.gain.value = usePlayerStore.getState().is3DEnabled ? 1.0 : 0.0
      spatialGainRef.current = spatialGain

      // 5. Panner Node (HRTF)
      const panner = ctx.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = 1
      panner.maxDistance = 50
      panner.rolloffFactor = 1
      pannerRef.current = panner

      // 6. Dry Gain Node
      const dryGain = ctx.createGain()
      dryGain.gain.value = 1.0
      dryGainRef.current = dryGain

      // 7. Reverb Convolver Node
      const convolver = ctx.createConvolver()
      // Build synthetic impulse response exactly like the original code
      const rate = ctx.sampleRate
      const duration = 2.2
      const decay = 3.2
      const length = rate * duration
      const impulse = ctx.createBuffer(2, length, rate)
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch)
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
        }
      }
      convolver.buffer = impulse
      convolverRef.current = convolver

      // 8. Wet Gain Node (Reverb Volume)
      const wetGain = ctx.createGain()
      wetGain.gain.value = usePlayerStore.getState().is3DReverbEnabled ? 0.25 : 0.0
      wetGainRef.current = wetGain

      // 9. Analyser Node
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
        ; (window as any).fermataAnalyser = analyser

      // --- Connect Graph (Source -> Preamp -> EQ Chain -> Splits) ---
      source.connect(preamp)
      preamp.connect(filters[0])
      for (let i = 0; i < 9; i++) {
        filters[i].connect(filters[i + 1])
      }

      filters[9].connect(normalGain)
      filters[9].connect(spatialGain)

      normalGain.connect(ctx.destination)

      // source -> panner -> [dry to destination] + [wet through convolver to destination]
      spatialGain.connect(panner)

      panner.connect(dryGain)
      panner.connect(convolver)

      convolver.connect(wetGain)

      dryGain.connect(analyser)
      wetGain.connect(analyser)

      analyser.connect(ctx.destination)
    } catch (err) {
      console.error('Failed to initialize spatial audio engine:', err)
    }
  }, [])

  const resumeAudioContext = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch((err) => {
        console.warn('AudioContext resume failed:', err)
      })
    }
  }, [])

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      const isMobileScreen = window.innerWidth < 768
      setIsMobile(isMobileUA || isMobileScreen)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const progressMs = usePlayerStore((s) => s.progressMs)
  const durationMs = usePlayerStore((s) => s.durationMs)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)

  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const setProgressMs = usePlayerStore((s) => s.setProgressMs)
  const setDurationMs = usePlayerStore((s) => s.setDurationMs)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const playNext = usePlayerStore((s) => s.playNext)
  const token = useAuthStore((s) => s.token)

  // --- Web Audio State Syncer (3D Mode) ---
  useEffect(() => {
    if (!audioContextRef.current) {
      if (is3DEnabled) {
        initSpatialEngine()
      } else {
        return
      }
    }
    const ctx = audioContextRef.current
    if (!ctx) return

    resumeAudioContext()

    const now = ctx.currentTime
    const normalGain = normalGainRef.current
    const spatialGain = spatialGainRef.current

    if (normalGain && spatialGain) {
      normalGain.gain.setValueAtTime(normalGain.gain.value, now)
      normalGain.gain.linearRampToValueAtTime(is3DEnabled ? 0.0 : 1.0, now + 0.05)

      spatialGain.gain.setValueAtTime(spatialGain.gain.value, now)
      spatialGain.gain.linearRampToValueAtTime(is3DEnabled ? 1.0 : 0.0, now + 0.05)
    }
  }, [is3DEnabled, initSpatialEngine, resumeAudioContext])

  // --- Web Audio State Syncer (Reverb) ---
  useEffect(() => {
    if (!audioContextRef.current) return
    const ctx = audioContextRef.current
    const wetGain = wetGainRef.current
    if (wetGain) {
      const now = ctx.currentTime
      wetGain.gain.setValueAtTime(wetGain.gain.value, now)
      wetGain.gain.linearRampToValueAtTime(is3DReverbEnabled ? 0.25 : 0.0, now + 0.05)
    }
  }, [is3DReverbEnabled])

  // --- Web Audio Position Update Loop (Orbit) ---
  useEffect(() => {
    let animationFrameId: number
    let angle = (window as any).fermata3DAngle || 0
    let lastTs = performance.now()

    const tick = (ts: number) => {
      const dt = (ts - lastTs) / 1000
      lastTs = ts

      const ctx = audioContextRef.current
      const panner = pannerRef.current

      if (isPlaying) {
        const revPerSec = 1 / orbitSpeedSeconds
        angle += dt * revPerSec * Math.PI * 2
        if (angle > Math.PI * 2) {
          angle -= Math.PI * 2
        }
      }

      const radius = 3
      const heightAmount = orbitHeightPercent / 100

      let x = 0
      let y = 0
      let z = -0.001

      if (is3DEnabled) {
        x = Math.cos(angle) * radius
        z = Math.sin(angle) * radius
        y = Math.sin(angle * 2) * heightAmount * radius * 0.6
      }

      if (panner && ctx) {
        if (panner.positionX) {
          panner.positionX.setValueAtTime(x, ctx.currentTime)
          panner.positionY.setValueAtTime(y, ctx.currentTime)
          panner.positionZ.setValueAtTime(z, ctx.currentTime)
        } else {
          ; (panner as any).setPosition(x, y, z)
        }
      }

      ; (window as any).fermata3DAngle = angle
        ; (window as any).fermata3DX = x
        ; (window as any).fermata3DY = y
        ; (window as any).fermata3DZ = z

      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [is3DEnabled, isPlaying, orbitSpeedSeconds, orbitHeightPercent])

  // --- Web Audio State Syncer (Equalizer Filters) ---
  useEffect(() => {
    if (!audioContextRef.current) return
    const ctx = audioContextRef.current
    const filters = eqFiltersRef.current
    if (filters && filters.length === 10) {
      const now = ctx.currentTime
      for (let i = 0; i < 10; i++) {
        const filter = filters[i]
        if (filter) {
          const targetGain = isEQEnabled ? (eqGains[i] ?? 0) : 0
          filter.gain.setValueAtTime(filter.gain.value, now)
          // Ramping smoothly over 50ms to prevent pops/clicks on drag/toggle
          filter.gain.linearRampToValueAtTime(targetGain, now + 0.05)
        }
      }
    }
  }, [eqGains, isEQEnabled])

  // --- Web Audio State Syncer (Equalizer Preamp) ---
  useEffect(() => {
    if (!audioContextRef.current) return
    const ctx = audioContextRef.current
    const preamp = preampRef.current
    if (preamp) {
      const now = ctx.currentTime
      const targetPreampDb = isEQEnabled ? eqPreamp : 0
      const linearGain = Math.pow(10, targetPreampDb / 20)
      preamp.gain.setValueAtTime(preamp.gain.value, now)
      // Ramping smoothly over 50ms to prevent pops/clicks on drag/toggle
      preamp.gain.linearRampToValueAtTime(linearGain, now + 0.05)
    }
  }, [eqPreamp, isEQEnabled])

  // Load player state on page mount / login
  useEffect(() => {
    if (!token) {
      usePlayerStore.setState({
        currentTrack: null,
        queue: [],
        isPlaying: false,
        progressMs: 0,
        durationMs: 0,
      })
      return
    }

    async function restorePlayerState() {
      try {
        const state = await getPlayerState()
        if (state) {
          if (state.track_id) {
            try {
              const track = await getTrack(state.track_id)
              if (track) {
                shouldRestoreProgress.current = true
                usePlayerStore.setState({
                  currentTrack: track,
                  isPlaying: false,
                  progressMs: state.progress_ms,
                  durationMs: track.duration_seconds ? track.duration_seconds * 1000 : 0,
                  volume: state.volume,
                  shuffle: state.shuffle,
                  repeatMode: state.repeat_mode as 'off' | 'context' | 'track',
                })
              }
            } catch (err) {
              console.error('Failed to load saved track details:', err)
            }
          } else {
            usePlayerStore.setState({
              currentTrack: null,
              progressMs: 0,
              volume: state.volume,
              shuffle: state.shuffle,
              repeatMode: state.repeat_mode as 'off' | 'context' | 'track',
            })
          }
        }
      } catch (err) {
        console.error('Failed to load initial player state:', err)
      } finally {
        setTimeout(() => {
          isInitialRestoring.current = false
        }, 1200)
      }
    }

    restorePlayerState()
  }, [token])

  // Sync settings/playback changes back to the database (debounced by 1s)
  useEffect(() => {
    if (!token || !currentTrack || isInitialRestoring.current) return

    const timer = setTimeout(() => {
      const payload: any = {
        track_id: currentTrack.id,
        is_playing: isPlaying,
        progress_ms: usePlayerStore.getState().progressMs,
        shuffle: shuffle,
        repeat_mode: repeatMode,
      }
      if (!isMobile) {
        payload.volume = volume
      }
      updatePlayerState(payload).catch(() => { })
    }, 1000)

    return () => clearTimeout(timer)
  }, [token, currentTrack, isPlaying, volume, shuffle, repeatMode, isMobile])

  // Periodic progress sync back to the database (every 5 seconds while playing)
  useEffect(() => {
    if (!token || !currentTrack || !isPlaying) return

    const interval = setInterval(() => {
      const payload: any = {
        track_id: currentTrack.id,
        is_playing: isPlaying,
        progress_ms: usePlayerStore.getState().progressMs,
        shuffle: usePlayerStore.getState().shuffle,
        repeat_mode: usePlayerStore.getState().repeatMode,
      }
      if (!isMobile) {
        payload.volume = usePlayerStore.getState().volume
      }
      updatePlayerState(payload).catch(() => { })
    }, 5000)

    return () => clearInterval(interval)
  }, [token, currentTrack, isPlaying, isMobile])

  // Load audio source when track changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    let cancelled = false

    // Immediately stop and unload the previous track to prevent overlapping streams
    audio.pause()
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    audio.removeAttribute('src')
    audio.load()

    if (!currentTrack) return

    async function loadAudio() {
      let url = ''
      try {
        const res = await getTrackAudioUrl(currentTrack!.id)
        if (res && res.audio_url) {
          url = res.audio_url
        }
      } catch (err) {
        console.error('Failed to get track audio URL:', err)
      }

      if (!url || cancelled) return

      try {
        // Explicitly apply volume to prevent browser volume resets on new track loads
        audio!.volume = isMobile ? 1.0 : Math.pow(usePlayerStore.getState().volume / 100, 2)

        const isHls = url.includes('.m3u8')

        if (isHls && Hls.isSupported()) {
          const hls = new Hls({
            loader: CustomKeyLoader as any,
            fLoader: CachedFragmentLoader as any,
            xhrSetup: (xhr, xhrUrl) => {
              console.log('[HLS xhrSetup] Requesting URL:', xhrUrl)
              if (xhrUrl.includes('/key')) {
                const storedToken = useAuthStore.getState().token
                console.log('[HLS xhrSetup] Matched /key endpoint. Token exists:', !!storedToken)
                if (storedToken) {
                  xhr.setRequestHeader('Authorization', `Bearer ${storedToken}`)
                }
              }
            }
          })

          hlsRef.current = hls
          hls.loadSource(url)
          hls.attachMedia(audio!)

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              const shouldPlay = usePlayerStore.getState().isPlaying
              if (shouldPlay) {
                audio!.play().catch((err) => {
                  console.warn('Auto-play blocked, click the page to enable playback:', err)
                })
                setIsPlaying(true)
              } else {
                setIsPlaying(false)
              }
            }
          })

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              console.error('Fatal HLS.js error:', data)
            }
          })
        } else {
          audio!.src = url
          audio!.load()

          const shouldPlay = usePlayerStore.getState().isPlaying
          if (shouldPlay) {
            audio!.play().catch((err) => {
              console.warn('Auto-play blocked, click the page to enable playback:', err)
            })
            setIsPlaying(true)
          } else {
            setIsPlaying(false)
          }
        }

        const shouldPlay = usePlayerStore.getState().isPlaying
        if (token && shouldPlay) {
          addRecentlyPlayed(currentTrack!.id).catch(() => { })
        }
      } catch (err) {
        console.error('Audio load error:', err)
      }
    }

    loadAudio()
    return () => {
      cancelled = true
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [currentTrack, setIsPlaying, token])

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMobile ? 1.0 : Math.pow(volume / 100, 2)
    }
  }, [volume, isMobile])

  // Sync playback play/pause state with store changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return

    if (isPlaying) {
      audio.play().catch((err) => {
        console.warn('Playback fail or auto-play blocked:', err)
      })
    } else {
      audio.pause()
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.5)) {
        audio.currentTime = 0
        setProgressMs(0)
      }
    }
  }, [isPlaying, setProgressMs])

  // Progress updates & Audio play events listener
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      setProgressMs(Math.round(audio.currentTime * 1000))
      if (audio.duration && !isNaN(audio.duration)) {
        setDurationMs(Math.round(audio.duration * 1000))
      }
    }
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDurationMs(audio.duration * 1000)
      }
      if (shouldRestoreProgress.current) {
        const savedProgressMs = usePlayerStore.getState().progressMs
        if (savedProgressMs > 0) {
          try {
            audio.currentTime = savedProgressMs / 1000
          } catch (err) {
            console.warn('Failed to restore playback position:', err)
          }
        }
        shouldRestoreProgress.current = false
      }
    }
    const onEnded = () => {
      const state = usePlayerStore.getState()
      if (state.repeatMode === 'track') {
        audio.currentTime = 0
        audio.play().catch(() => { })
        setProgressMs(0)
        setIsPlaying(true)
      } else {
        playNext(false)
      }
    }

    const onPlay = () => {
      initSpatialEngine()
      resumeAudioContext()
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('playing', onPlay)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('playing', onPlay)
    }
  }, [currentTrack, setProgressMs, setDurationMs, setIsPlaying, playNext, initSpatialEngine, resumeAudioContext])

  // Expose a global seek helper for components like ExpandedPlayer that don't have direct ref access
  useEffect(() => {
    (window as any).fermataSeek = (ms: number) => {
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = ms / 1000
        } catch (err) {
          console.warn('FermataSeek failed:', err)
        }
      }
    }
    return () => {
      delete (window as any).fermataSeek
    }
  }, [])

  const toggleMute = useCallback(() => {
    setVolume(volume === 0 ? 50 : 0)
  }, [volume, setVolume])

  if (!currentTrack) {
    return null
  }

  const progress = durationMs > 0 ? (progressMs / durationMs) * 100 : 0

  return (
    <>
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" />

      {/* Desktop view */}
      <div
        onClick={() => usePlayerStore.setState({ isExpanded: true })}
        className="hidden md:flex h-20 bg-surface-elevated items-center px-4 gap-4 justify-between shrink-0 cursor-pointer hover:bg-surface-elevated/80 transition-colors"
        style={{
          borderTop: '1.5px solid var(--spotify-green)',
        }}
      >
        {/* Track Info — Left */}
        <div className="flex items-center gap-3 min-w-0 w-[240px] shrink-0">
          {currentTrack.cover_url ? (
            <img
              src={currentTrack.cover_url}
              alt={currentTrack.title}
              loading="lazy"
              className="w-12 h-12 rounded-md object-cover shrink-0 shadow"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
              <Music size={18} className="text-subtext" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{currentTrack.title}</p>
            <p className="text-xs text-subtext truncate">
              {currentTrack.artist_name || 'Unknown Artist'}
            </p>
          </div>
        </div>

        {/* Controls — Center */}
        <div onClick={(e) => e.stopPropagation()} className="flex-1 flex justify-center max-w-[600px]">
          <PlayerControls audioRef={audioRef} />
        </div>

        {/* Volume — Right */}
        {!isMobile && (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 w-[160px] justify-end relative">
            <button
              onClick={toggleMute}
              className="p-1 text-subtext hover:text-primary transition-colors cursor-pointer"
              title="Volume Control"
            >
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-24 accent-spotify-green h-1 cursor-pointer bg-zinc-700 rounded-full"
            />
          </div>
        )}
      </div>

      {/* Mobile view (Spotify-like floating card) */}
      <div
        onClick={() => usePlayerStore.setState({ isExpanded: true })}
        className="flex md:hidden items-center justify-between mx-2 mb-2 h-14 bg-surface-elevated/95 backdrop-blur border border-surface-highlight/60 rounded-lg px-3 gap-3 relative overflow-hidden shadow-lg shadow-black/40 cursor-pointer hover:bg-surface-elevated/80 transition-colors"
      >
        {/* Progress Bar (at the very bottom of the card) */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-surface-highlight/30">
          <div className="h-full bg-spotify-green transition-all duration-100" style={{ width: `${progress}%` }} />
        </div>

        {/* Track Info */}
        <div className="flex items-center min-w-0 flex-1 gap-2.5">
          {currentTrack.cover_url ? (
            <img
              src={currentTrack.cover_url}
              alt={currentTrack.title}
              loading="lazy"
              className="w-9 h-9 rounded object-cover shrink-0 shadow"
            />
          ) : (
            <div className="w-9 h-9 rounded bg-surface-highlight flex items-center justify-center shrink-0">
              <Music size={14} className="text-subtext" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate text-primary">{currentTrack.title}</p>
            <p className="text-[10px] text-subtext truncate mt-0.5">
              {currentTrack.artist_name || 'Unknown Artist'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsPlaying(!isPlaying)
            }}
            className="p-1 hover:scale-105 transition-transform text-primary cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
        </div>
      </div>
    </>
  )
}
