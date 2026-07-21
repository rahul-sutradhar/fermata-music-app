import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Disc3, ListMusic, Music, Play } from 'lucide-react'
import { getLibrary, getLikedAlbums } from '@/api/library'
import { getTrack } from '@/api/tracks'
import { getAlbum, getAlbumTracks } from '@/api/albums'
import { getMyPlaylists } from '@/api/playlists'
import { usePlayerStore } from '@/store/playerStore'
import type { Track, Album, Playlist } from '@/types'
import TrackList from '@/components/TrackList'
import { parsePlaylistName } from '@/components/Sidebar'

type Tab = 'songs' | 'albums' | 'playlists'

function AlbumCard({ album, onPlay }: { album: Album; onPlay: (a: Album) => void }) {
  const navigate = useNavigate()
  return (
    <div
      className="group relative bg-surface-elevated hover:bg-surface-highlight rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-xl"
      onClick={() => navigate(`/album/${album.id}`)}
    >
      {/* Cover */}
      <div className="relative mb-4">
        {album.cover_url ? (
          <img
            src={album.cover_url}
            alt={album.title}
            className="w-full aspect-square rounded-lg object-cover shadow-lg"
          />
        ) : (
          <div className="w-full aspect-square rounded-lg bg-surface-highlight flex items-center justify-center shadow-lg">
            <Disc3 size={48} className="text-subtext/30" />
          </div>
        )}
        {/* Hover play button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPlay(album)
          }}
          className="absolute bottom-3 right-3 w-11 h-11 bg-spotify-green rounded-full items-center justify-center shadow-xl translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 hidden group-hover:flex"
        >
          <Play size={18} className="text-black ml-0.5" fill="currentColor" />
        </button>
      </div>

      <p className="text-sm font-semibold text-primary truncate">{album.title}</p>
      <p className="text-xs text-subtext mt-0.5 truncate">{album.artist_name || 'Unknown Artist'}</p>
    </div>
  )
}

function PlaylistCard({ playlist, onOpen }: { playlist: Playlist; onOpen: (p: Playlist) => void }) {
  const parsed = parsePlaylistName(playlist.name)
  return (
    <div
      className="group relative bg-surface-elevated hover:bg-surface-highlight rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-xl"
      onClick={() => onOpen(playlist)}
    >
      <div className="relative mb-4">
        {playlist.cover_url ? (
          <img
            src={playlist.cover_url}
            alt={parsed.name}
            className="w-full aspect-square rounded-lg object-cover shadow-lg"
          />
        ) : (
          <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-spotify-green/20 to-surface-highlight flex items-center justify-center shadow-lg">
            <ListMusic size={48} className="text-spotify-green/50" />
          </div>
        )}
      </div>
      <p className="text-sm font-semibold text-primary truncate">{parsed.name}</p>
      {parsed.artist && (
        <p className="text-xs text-subtext mt-0.5 truncate">By {parsed.artist}</p>
      )}
    </div>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('songs')

  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)

  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [libraryItems, likedAlbumItems, myPlaylists] = await Promise.all([
        getLibrary(0, 50),
        getLikedAlbums(0, 50),
        getMyPlaylists(),
      ])

      // Resolve full track objects
      const trackDetails = await Promise.all(
        libraryItems.map((item) => getTrack(item.track_id).catch(() => null)),
      )
      setTracks(trackDetails.filter(Boolean) as Track[])

      // Resolve full album objects
      const albumDetails = await Promise.all(
        likedAlbumItems.map((item) => getAlbum(item.album_id).catch(() => null)),
      )
      setAlbums(albumDetails.filter(Boolean) as Album[])

      setPlaylists(myPlaylists)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // Re-load if playlists are updated from elsewhere (e.g. Sidebar creates one)
    const handler = () => loadData()
    window.addEventListener('playlist-updated', handler)
    return () => window.removeEventListener('playlist-updated', handler)
  }, [loadData])

  const handlePlayAlbum = async (album: Album) => {
    try {
      const albumTracks = await getAlbumTracks(album.id, 0, 50)
      if (albumTracks.length > 0) {
        setQueue(albumTracks)
        setTrack(albumTracks[0])
      }
    } catch {
      // silent
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'songs', label: 'Liked Songs', icon: <Heart size={15} />, count: tracks.length },
    { id: 'albums', label: 'Liked Albums', icon: <Disc3 size={15} />, count: albums.length },
    { id: 'playlists', label: 'Playlists', icon: <ListMusic size={15} />, count: playlists.length },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Heart size={28} className="text-spotify-green" />
        <h1 className="text-3xl font-bold">Your Library</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-surface-highlight pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-spotify-green border-spotify-green bg-surface-highlight/30'
                : 'text-subtext border-transparent hover:text-primary hover:bg-surface-highlight/20'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === tab.id
                    ? 'bg-spotify-green text-black'
                    : 'bg-surface-highlight text-subtext'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}

      {/* Liked Songs */}
      {activeTab === 'songs' && (
        <>
          {tracks.length === 0 ? (
            <div className="py-20 text-center text-subtext">
              <Heart size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No liked songs yet</p>
              <p className="text-sm mt-1">Hit the ♥ on any track to save it here</p>
            </div>
          ) : (
            <div>
              {/* Quick play all */}
              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => {
                    setQueue(tracks)
                    setTrack(tracks[0])
                  }}
                  className="w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 hover:bg-spotify-green-hover transition-all shadow-lg"
                  title="Play all liked songs"
                >
                  <Play size={22} className="text-black ml-0.5" fill="currentColor" />
                </button>
                <span className="text-sm text-subtext">{tracks.length} song{tracks.length !== 1 ? 's' : ''}</span>
              </div>
              <TrackList tracks={tracks} />
            </div>
          )}
        </>
      )}

      {/* Liked Albums */}
      {activeTab === 'albums' && (
        <>
          {albums.length === 0 ? (
            <div className="py-20 text-center text-subtext">
              <Disc3 size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No liked albums yet</p>
              <p className="text-sm mt-1">Hit the ♥ on any album page to save it here</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} onPlay={handlePlayAlbum} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Playlists */}
      {activeTab === 'playlists' && (
        <>
          {playlists.length === 0 ? (
            <div className="py-20 text-center text-subtext">
              <ListMusic size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No playlists yet</p>
              <p className="text-sm mt-1">Create a playlist to organise your music</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {playlists.map((pl) => (
                <PlaylistCard
                  key={pl.id}
                  playlist={pl}
                  onOpen={(p) => navigate(`/playlist/${p.id}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
