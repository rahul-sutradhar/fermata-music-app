import { useAuthStore } from '@/store/authStore'
import { API_BASE } from '@/api/client'

const AUDIO_CACHE = 'fermata-audio-cache-v1'
const API_CACHE = 'fermata-api-v1'
const OFFLINE_TRACKS_KEY = 'fermata_offline_track_ids'
const TRACK_KEYS_PREFIX = 'fermata_track_cache_keys_'

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

/**
 * Preload a track's metadata, playlist, decryption keys, and audio segments for offline playback.
 */
export async function preloadTrackForOffline(trackId: number) {
  try {
    console.log(`[Offline Cache] Preloading track ${trackId}...`)
    const apiBaseClean = API_BASE.replace(/\/$/, '')
    const authHeaders = getAuthHeaders()

    const apiCache = await caches.open(API_CACHE)
    const audioCache = await caches.open(AUDIO_CACHE)

    const cacheKeysRecorded: string[] = []

    // 1. Fetch and Cache Track Metadata
    const metadataUrl = `${apiBaseClean}/tracks/${trackId}`
    const metadataResponse = await fetch(metadataUrl, { headers: authHeaders })
    if (!metadataResponse.ok) {
      throw new Error(`Failed to fetch metadata: ${metadataResponse.status}`)
    }
    await apiCache.put(metadataUrl, metadataResponse.clone())
    cacheKeysRecorded.push(metadataUrl)

    // 2. Fetch and Cache Audio URL JSON
    const audioUrlEndpoint = `${apiBaseClean}/tracks/${trackId}/audio`
    const audioUrlResponse = await fetch(audioUrlEndpoint, { headers: authHeaders })
    if (!audioUrlResponse.ok) {
      throw new Error(`Failed to fetch audio URL: ${audioUrlResponse.status}`)
    }
    await apiCache.put(audioUrlEndpoint, audioUrlResponse.clone())
    cacheKeysRecorded.push(audioUrlEndpoint)

    const audioData = await audioUrlResponse.json()
    const audioUrl = audioData?.audio_url
    if (!audioUrl) {
      console.warn(`[Offline Cache] Track ${trackId} has no audio URL. Skipping playlist fetch.`)
      return
    }

    // 3. Fetch and Cache Playlist (.m3u8)
    const playlistResponse = await fetch(audioUrl, { headers: authHeaders })
    if (!playlistResponse.ok) {
      throw new Error(`Failed to fetch playlist from URL: ${audioUrl}`)
    }
    const playlistText = await playlistResponse.text()

    // Store playlist in audioCache
    await audioCache.put(
      audioUrl,
      new Response(playlistText, {
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl' }
      })
    )
    cacheKeysRecorded.push(audioUrl)

    // 4. Parse key URIs and segment URLs from the playlist
    const lines = playlistText.split('\n')
    const segmentUrls: string[] = []
    let keyUrl: string | null = null

    // Determine the base URL for segment references if they are relative
    let basePlaylistUrl = ''
    try {
      basePlaylistUrl = audioUrl.substring(0, audioUrl.lastIndexOf('/') + 1)
    } catch (_) {}

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.startsWith('#EXT-X-KEY')) {
        const match = trimmed.match(/URI="([^"]+)"/)
        if (match) {
          keyUrl = match[1]
        }
      } else if (!trimmed.startsWith('#')) {
        // Resolve to absolute URL if needed
        let segmentAbsoluteUrl = trimmed
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          segmentAbsoluteUrl = basePlaylistUrl + trimmed
        }
        segmentUrls.push(segmentAbsoluteUrl)
      }
    }

    // 5. Fetch and Cache Decryption Key
    if (keyUrl) {
      console.log(`[Offline Cache] Found decryption key URL for track ${trackId}: ${keyUrl}`)
      const keyResponse = await fetch(keyUrl, { headers: authHeaders })
      if (keyResponse.ok) {
        const keyBuffer = await keyResponse.arrayBuffer()
        await audioCache.put(
          keyUrl,
          new Response(keyBuffer, {
            headers: { 'Content-Type': 'application/octet-stream' }
          })
        )
        cacheKeysRecorded.push(keyUrl)
        console.log(`[Offline Cache] Successfully cached key: ${keyUrl}`)
      } else {
        console.warn(`[Offline Cache] Failed to fetch decryption key from: ${keyUrl}`)
      }
    }

    // 6. Fetch and Cache HLS Segments
    console.log(`[Offline Cache] Preloading ${segmentUrls.length} segments for track ${trackId}...`)
    for (const segmentUrl of segmentUrls) {
      const match = await audioCache.match(segmentUrl)
      if (!match) {
        try {
          const segmentResponse = await fetch(segmentUrl)
          if (segmentResponse.ok) {
            const segmentBuffer = await segmentResponse.arrayBuffer()
            await audioCache.put(
              segmentUrl,
              new Response(segmentBuffer, {
                headers: { 'Content-Type': 'video/mp2t' }
              })
            )
            cacheKeysRecorded.push(segmentUrl)
          } else {
            console.warn(`[Offline Cache] Non-ok status for segment: ${segmentUrl}`)
          }
        } catch (segmentErr) {
          console.warn(`[Offline Cache] Failed to fetch segment: ${segmentUrl}`, segmentErr)
        }
      } else {
        // Already cached, keep track of it
        cacheKeysRecorded.push(segmentUrl)
      }
    }

    // Save the list of cached URLs for eviction lookup
    localStorage.setItem(`${TRACK_KEYS_PREFIX}${trackId}`, JSON.stringify(cacheKeysRecorded))
    console.log(`[Offline Cache] Track ${trackId} preloaded completely.`)
  } catch (err) {
    console.warn(`[Offline Cache] Preloading failed for track ${trackId}:`, err)
  }
}

/**
 * Add a track to the list of the last 10 offline tracks and trigger its caching.
 * Evicts the oldest track if the limit is exceeded.
 */
export async function addToOfflineTracks(trackId: number) {
  try {
    let offlineTrackIds: number[] = []
    const stored = localStorage.getItem(OFFLINE_TRACKS_KEY)
    if (stored) {
      try {
        offlineTrackIds = JSON.parse(stored)
      } catch (_) {}
    }

    // Remove track if already exists, then append to end (most recent)
    offlineTrackIds = offlineTrackIds.filter(id => id !== trackId)
    offlineTrackIds.push(trackId)

    // Handle eviction if more than 10 tracks
    if (offlineTrackIds.length > 10) {
      const evictedId = offlineTrackIds.shift()
      if (evictedId !== undefined) {
        await evictTrack(evictedId)
      }
    }

    localStorage.setItem(OFFLINE_TRACKS_KEY, JSON.stringify(offlineTrackIds))

    // Start background preload
    preloadTrackForOffline(trackId)
  } catch (err) {
    console.warn('[Offline Cache] Failed to manage offline track list:', err)
  }
}

/**
 * Remove all cached assets and metadata related to a track.
 */
async function evictTrack(trackId: number) {
  try {
    console.log(`[Offline Cache] Evicting track ${trackId} from offline storage...`)
    const keysJson = localStorage.getItem(`${TRACK_KEYS_PREFIX}${trackId}`)
    if (keysJson) {
      const keys: string[] = JSON.parse(keysJson)
      const audioCache = await caches.open(AUDIO_CACHE)
      const apiCache = await caches.open(API_CACHE)

      for (const key of keys) {
        if (key.includes('/tracks/')) {
          await apiCache.delete(key)
        } else {
          await audioCache.delete(key)
        }
      }
      localStorage.removeItem(`${TRACK_KEYS_PREFIX}${trackId}`)
      console.log(`[Offline Cache] Successfully cleaned up cache for track ${trackId}`)
    }
  } catch (err) {
    console.warn(`[Offline Cache] Failed to evict track ${trackId}:`, err)
  }
}
