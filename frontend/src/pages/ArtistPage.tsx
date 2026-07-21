import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { User, Music } from 'lucide-react'
import { getArtist, getArtistAlbums, getArtistSingles } from '@/api/artists'
import type { Artist, Album, Track } from '@/types'
import CardGrid from '@/components/CardGrid'
import Card from '@/components/Card'
import TrackRow, { TrackListHeader } from '@/components/TrackRow'

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>()
  const [artist, setArtist] = useState<Artist | null>(null)
  const [albums, setAlbums] = useState<Album[]>([])
  const [singles, setSingles] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const [artistData, albumData, singlesData] = await Promise.all([
          getArtist(Number(id)),
          getArtistAlbums(Number(id), 0, 50),
          getArtistSingles(Number(id), 0, 50),
        ])
        setArtist(artistData)
        setAlbums(albumData)
        setSingles(singlesData)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="py-20 text-center text-subtext">
        <p className="text-lg">Artist not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end gap-6 mb-8">
        <div className="w-48 h-48 rounded-full bg-surface-highlight flex items-center justify-center shadow-2xl shrink-0">
          <User size={64} className="text-subtext/40" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-subtext mb-1">Artist</p>
          <h1 className="text-5xl font-bold mb-2 truncate">{artist.name}</h1>
        </div>
      </div>

      {/* Standalone Singles & EPs */}
      {singles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Music size={20} className="text-spotify-green" />
            <h2 className="text-2xl font-bold text-primary">Singles & EPs</h2>
          </div>
          <div className="rounded-xl border border-surface-highlight/40 overflow-hidden bg-surface-elevated/20 p-2">
            <TrackListHeader />
            <div className="divide-y divide-surface-highlight/20 mt-1">
              {singles.map((track, i) => (
                <TrackRow key={track.id} track={track} index={i} tracks={singles} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Albums */}
      {albums.length > 0 ? (
        <CardGrid title="Albums">
          {albums.map((album) => (
            <Card
              key={album.id}
              title={album.title}
              subtitle="Album"
              href={`/album/${album.id}`}
            />
          ))}
        </CardGrid>
      ) : (
        singles.length === 0 && (
          <div className="py-12 text-center text-subtext">
            <p className="text-sm">No albums or singles released yet</p>
          </div>
        )
      )}
    </div>
  )
}
