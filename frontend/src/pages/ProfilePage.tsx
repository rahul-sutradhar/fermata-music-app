import { useEffect, useState } from 'react'
import { User, Crown, Music } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/api/auth'
import { getTopItems } from '@/api/users'
import type { TopItem } from '@/types'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [topArtists, setTopArtists] = useState<TopItem[]>([])
  const [topTracks, setTopTracks] = useState<TopItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        // Refresh user data
        const me = await getMe()
        setUser(me)

        const [artists, tracks] = await Promise.all([
          getTopItems('artists', 'medium_term', 10).catch(() => []),
          getTopItems('tracks', 'medium_term', 10).catch(() => []),
        ])
        setTopArtists(artists)
        setTopTracks(tracks)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [setUser])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Profile Header */}
      <div className="flex items-center gap-6 mb-10">
        <div className="w-40 h-40 rounded-full bg-surface-highlight flex items-center justify-center shadow-2xl">
          <User size={56} className="text-subtext/40" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-subtext mb-1">Profile</p>
          <h1 className="text-4xl font-bold">{user?.username || 'User'}</h1>
          <p className="text-sm text-subtext mt-1">{user?.email}</p>
          {user?.role && (
            <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full text-xs font-medium bg-spotify-green/10 text-spotify-green">
              <Crown size={12} />
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Top Artists */}
        <section>
          <h2 className="text-xl font-bold mb-4">Top Artists</h2>
          {topArtists.length === 0 ? (
            <p className="text-sm text-subtext">No data yet — keep listening!</p>
          ) : (
            <div className="space-y-2">
              {topArtists.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-highlight/50 transition-colors"
                >
                  <span className="text-sm text-subtext w-6 text-center tabular-nums font-medium">
                    {i + 1}
                  </span>
                  <div className="w-10 h-10 rounded-full bg-surface-highlight flex items-center justify-center">
                    <User size={16} className="text-subtext" />
                  </div>
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top Tracks */}
        <section>
          <h2 className="text-xl font-bold mb-4">Top Tracks</h2>
          {topTracks.length === 0 ? (
            <p className="text-sm text-subtext">No data yet — keep listening!</p>
          ) : (
            <div className="space-y-2">
              {topTracks.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-highlight/50 transition-colors"
                >
                  <span className="text-sm text-subtext w-6 text-center tabular-nums font-medium">
                    {i + 1}
                  </span>
                  <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center">
                    <Music size={16} className="text-subtext" />
                  </div>
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
