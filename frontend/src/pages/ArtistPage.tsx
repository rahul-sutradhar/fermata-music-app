import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { User } from 'lucide-react'
import { getArtist, getArtistAlbums } from '@/api/artists'
import type { Artist, Album } from '@/types'
import CardGrid from '@/components/CardGrid'
import Card from '@/components/Card'

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>()
  const [artist, setArtist] = useState<Artist | null>(null)
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const [artistData, albumData] = await Promise.all([
          getArtist(Number(id)),
          getArtistAlbums(Number(id), 0, 50),
        ])
        setArtist(artistData)
        setAlbums(albumData)
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
    <div>
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

      {/* Albums */}
      {albums.length > 0 ? (
        <CardGrid title="Discography">
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
        <div className="py-12 text-center text-subtext">
          <p className="text-sm">No albums found</p>
        </div>
      )}
    </div>
  )
}
