import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { X, Music } from 'lucide-react'
import SearchInput from '@/components/SearchInput'
import CardGrid from '@/components/CardGrid'
import Card from '@/components/Card'
import TrackList from '@/components/TrackList'
import { search } from '@/api/search'
import { usePlayerStore } from '@/store/playerStore'
import { useAuthStore } from '@/store/authStore'
import type { SearchResponse, Track } from '@/types'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const user = useAuthStore((s) => s.user)
  const [recentSearchPlayed, setRecentSearchPlayed] = useState<Track[]>([])

  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)

  // Load history on mount or when user changes
  useEffect(() => {
    if (!user) {
      setRecentSearchPlayed([])
      return
    }
    const historyKey = `fermata-search-played-${user.id}`
    const stored = localStorage.getItem(historyKey)
    if (stored) {
      try {
        setRecentSearchPlayed(JSON.parse(stored))
      } catch {
        // silent
      }
    } else {
      setRecentSearchPlayed([])
    }
  }, [user])

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) {
      setResults(null)
      return
    }
    setLoading(true)
    try {
      const res = await search(q, 20)
      setResults(res)
    } catch (err) {
      console.error('Search query failed:', err)
      setResults({ query: q, tracks: [], albums: [], artists: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTrackPlay = (track: Track) => {
    if (!user) return
    const historyKey = `fermata-search-played-${user.id}`
    setRecentSearchPlayed((prev) => {
      const filtered = prev.filter((t) => t.id !== track.id)
      const updated = [track, ...filtered].slice(0, 10)
      localStorage.setItem(historyKey, JSON.stringify(updated))
      return updated
    })
  }

  const handleRemoveTrack = (trackId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) return
    const historyKey = `fermata-search-played-${user.id}`
    setRecentSearchPlayed((prev) => {
      const updated = prev.filter((t) => t.id !== trackId)
      localStorage.setItem(historyKey, JSON.stringify(updated))
      return updated
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search</h1>
        <p className="text-sm text-subtext mt-1">
          Explore tracks, albums, and artists in Fermata
        </p>
      </div>

      <SearchInput value={query} onChange={handleSearch} />

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-subtext">Searching music...</p>
        </div>
      )}

      {results && !loading && (
        <div className="mt-6 space-y-8 animate-in fade-in duration-200">
          {/* Tracks */}
          {results.tracks.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">Tracks</h2>
              <TrackList tracks={results.tracks} onTrackPlay={handleTrackPlay} />
            </section>
          )}

          {/* Albums */}
          {results.albums.length > 0 && (
            <CardGrid title="Albums">
              {results.albums.map((album) => (
                <Card
                  key={album.id}
                  title={album.title}
                  subtitle={album.artist_name || 'Unknown Artist'}
                  imageUrl={album.cover_url}
                  href={`/album/${album.id}`}
                />
              ))}
            </CardGrid>
          )}

          {/* Artists */}
          {results.artists.length > 0 && (
            <CardGrid title="Artists">
              {results.artists.map((artist) => (
                <Card
                  key={artist.id}
                  title={artist.name}
                  subtitle="Artist"
                  href={`/artist/${artist.id}`}
                  isRound
                />
              ))}
            </CardGrid>
          )}

          {/* Subtle banner at bottom of active results */}
          {(results.tracks.length > 0 || results.albums.length > 0 || results.artists.length > 0) && (
            <div className="mt-12 pt-6 border-t border-surface-highlight/20 text-center animate-in fade-in duration-300">
              <p className="text-sm text-subtext">
                Don't see the exact version you wanted?
              </p>
              <div className="mt-3">
                <Link
                  to="/report-missing"
                  state={{ prefilledQuery: query }}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full bg-surface-highlight hover:bg-surface-highlight/80 text-primary transition-all transform hover:scale-105"
                >
                  Report Missing Song
                </Link>
              </div>
            </div>
          )}

          {/* No results */}
          {results.tracks.length === 0 &&
            results.albums.length === 0 &&
            results.artists.length === 0 && (
              <div className="py-16 text-center text-subtext bg-surface-highlight/10 rounded-2xl border border-surface-highlight/30">
                <p className="text-base font-semibold text-primary">No results found for "{query}"</p>
                <p className="text-xs mt-1 text-subtext">
                  Please check your spelling or search another artist, song, or album title
                </p>
                <div className="mt-5">
                  <Link
                    to="/report-missing"
                    state={{ prefilledQuery: query }}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-full bg-spotify-green hover:bg-spotify-green/80 text-black transition-all transform hover:scale-105"
                  >
                    Report Missing Song
                  </Link>
                </div>
              </div>
            )}
        </div>
      )}

      {!results && !loading && query === '' && (
        <div className="mt-6">
          {recentSearchPlayed.length > 0 ? (
            <section className="animate-in fade-in duration-300">
              <h2 className="text-xl font-bold mb-4">Recent Searches / Played Tracks</h2>
              <div className="space-y-1">
                {recentSearchPlayed.map((track) => (
                  <div
                    key={track.id}
                    onClick={() => {
                      setQueue([track])
                      setTrack(track)
                    }}
                    className="group flex items-center justify-between px-4 py-3 rounded-lg hover:bg-surface-highlight/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Music size={16} className="text-subtext" />
                      <div className="min-w-0 font-sans">
                        <p className="text-sm font-semibold truncate text-primary group-hover:text-spotify-green transition-colors">
                          {track.title}
                        </p>
                        <p className="text-xs text-subtext truncate">
                          {track.artist_name || 'Unknown Artist'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleRemoveTrack(track.id, e)}
                      className="p-1 rounded-full text-subtext hover:text-red-400 hover:bg-surface-highlight opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove from history"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="py-20 text-center text-subtext">
              <p className="text-lg font-medium">Search for music</p>
              <p className="text-sm mt-1">Find tracks, albums, and artists</p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && query !== '' && (
        <div className="py-16 text-center text-subtext bg-surface-highlight/10 rounded-2xl border border-surface-highlight/30 mt-6">
          <p className="text-base font-semibold text-primary">No results found for "{query}"</p>
          <p className="text-xs mt-1 text-subtext">
            Please check your spelling or search another artist, song, or album title
          </p>
          <div className="mt-5">
            <Link
              to="/report-missing"
              state={{ prefilledQuery: query }}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-full bg-spotify-green hover:bg-spotify-green/80 text-black transition-all transform hover:scale-105"
            >
              Report Missing Song
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
