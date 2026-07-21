import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePlayerStore } from '@/store/playerStore'
import { getRecentlyPlayed } from '@/api/player'
import { getTrack, listTracks } from '@/api/tracks'
import { getMyPlaylists } from '@/api/playlists'
import { listAlbums } from '@/api/albums'
import type { Track, Playlist, Album } from '@/types'
import CardGrid from '@/components/CardGrid'
import Card from '@/components/Card'
import TrackList from '@/components/TrackList'
import { parsePlaylistName } from '@/components/Sidebar'

export default function HomePage() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)

  const [recentTracks, setRecentTracks] = useState<Track[]>([])
  const [mostPlayedTracks, setMostPlayedTracks] = useState<Track[]>([])
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        // Load all tracks and albums
        const [tracksData, albumsData] = await Promise.all([
          listTracks(0, 50),
          listAlbums(0, 50),
        ])
        setAllTracks(tracksData)
        setAlbums(albumsData)

        // Mock most played tracks (first 5 tracks)
        setMostPlayedTracks(tracksData.slice(0, 5))

        if (token) {
          // Load recent + playlists for logged-in users
          const [recent, pls] = await Promise.all([
            getRecentlyPlayed(0, 12),
            getMyPlaylists(),
          ])
          setPlaylists(pls)

          // Resolve track details for recently played (in-memory lookup first to avoid extra HTTP calls)
          const trackMap = new Map(tracksData.map((t) => [t.id, t]))
          const trackDetails = await Promise.all(
            recent.slice(0, 8).map((r) => {
              if (trackMap.has(r.track_id)) {
                return trackMap.get(r.track_id)!
              }
              return getTrack(r.track_id).catch(() => null)
            }),
          )
          setRecentTracks(trackDetails.filter(Boolean) as Track[])
        }
      } catch (err) {
        console.error('Failed to load homepage data:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">
          {token && user ? `${greeting()}, ${user.username}` : greeting()}
        </h1>
        <p className="text-sm text-subtext">Welcome back to your personalized soundstage</p>
      </div>

      {/* Recently Played Music Quick Grid */}
      {recentTracks.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">Recently Played Music</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {recentTracks.map((track) => (
              <button
                key={track.id}
                onClick={() => {
                  setQueue(recentTracks)
                  setTrack(track)
                }}
                className="flex items-center gap-3 bg-surface-highlight/40 hover:bg-surface-highlight/95 rounded-md overflow-hidden transition-all duration-200 group text-left p-0 border border-transparent hover:border-surface-highlight cursor-pointer"
              >
                <div className="w-16 h-16 bg-surface-highlight flex items-center justify-center shrink-0">
                  <span className="text-subtext text-lg font-bold">
                    {track.title.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-semibold truncate text-primary group-hover:text-spotify-green transition-colors">{track.title}</p>
                  <p className="text-xs text-subtext truncate mt-0.5">{track.artist_name || 'Unknown Artist'}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Most Played Music */}
      {mostPlayedTracks.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">Your Most Played Tracks</h2>
          <div className="bg-surface-elevated/20 rounded-xl p-4 border border-surface-highlight/30">
            <TrackList tracks={mostPlayedTracks} showHeader={false} />
          </div>
        </section>
      )}

      {/* Albums Grids */}
      {albums.length > 0 && (
        <>
          <CardGrid title="Recently Played Albums">
            {albums.slice(0, 6).map((album) => (
              <Card
                key={album.id}
                title={album.title}
                subtitle={album.artist_name || 'Various Artists'}
                imageUrl={album.cover_url}
                href={`/album/${album.id}`}
                onPlay={() => {
                  // Play album tracks directly (handled inside Card click/play on Home)
                }}
              />
            ))}
          </CardGrid>

          <CardGrid title="Most Played Albums">
            {albums.slice(2, 8).map((album) => (
              <Card
                key={album.id}
                title={album.title}
                subtitle={album.artist_name || 'Various Artists'}
                imageUrl={album.cover_url}
                href={`/album/${album.id}`}
              />
            ))}
          </CardGrid>
        </>
      )}


      {/* Your Playlists */}
      {playlists.length > 0 && (
        <CardGrid title="Your Playlists">
          {playlists.map((pl) => {
            const info = parsePlaylistName(pl.name)
            return (
              <Card
                key={pl.id}
                title={info.name}
                subtitle={info.artist ? `By ${info.artist}` : 'Playlist'}
                href={`/playlist/${pl.id}`}
              />
            )
          })}
        </CardGrid>
      )}
    </div>
  )
}
