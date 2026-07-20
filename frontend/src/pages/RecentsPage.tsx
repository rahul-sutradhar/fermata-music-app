import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { getRecentlyPlayed } from '@/api/player'
import { getTrack } from '@/api/tracks'
import type { Track } from '@/types'
import TrackList from '@/components/TrackList'

export default function RecentsPage() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const recent = await getRecentlyPlayed(0, 50)
        // Resolve track details for each recently played item
        const trackDetails = await Promise.all(
          recent.map((item) => getTrack(item.track_id).catch(() => null)),
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
        <History size={28} className="text-spotify-green" />
        <h1 className="text-3xl font-bold">Recently Played</h1>
      </div>

      {tracks.length === 0 ? (
        <div className="py-20 text-center text-subtext">
          <History size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No recently played tracks</p>
          <p className="text-sm mt-1">Start listening to build your recent history</p>
        </div>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </div>
  )
}
