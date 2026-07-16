import { useEffect, useState } from 'react'
import { Library as LibraryIcon } from 'lucide-react'
import { getLibrary } from '@/api/library'
import { getTrack } from '@/api/tracks'
import type { Track } from '@/types'
import TrackList from '@/components/TrackList'

export default function LibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const items = await getLibrary(0, 50)
        // Resolve track details for each library item
        const trackDetails = await Promise.all(
          items.map((item) => getTrack(item.track_id).catch(() => null)),
        )
        setTracks(trackDetails.filter(Boolean) as Track[])
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <LibraryIcon size={28} className="text-spotify-green" />
        <h1 className="text-3xl font-bold">Your Library</h1>
      </div>

      {tracks.length === 0 ? (
        <div className="py-20 text-center text-subtext">
          <LibraryIcon size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Your library is empty</p>
          <p className="text-sm mt-1">Save tracks to build your collection</p>
        </div>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  )
}
