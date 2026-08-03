import { useEffect, useState } from 'react'
import { History, ChevronDown, ChevronUp, Play } from 'lucide-react'
import { getRecentlyPlayed } from '@/api/player'
import type { Track, RecentlyPlayed } from '@/types'
import { usePlayerStore } from '@/store/playerStore'
import TrackList from '@/components/TrackList'

interface Session {
  id: string
  type: 'album' | 'artist' | 'mix'
  name: string
  subtitle: string
  tracks: Track[]
  covers: string[]
}

interface DayGroup {
  dayLabel: string
  sessions: Session[]
}

const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`
}

function groupRecentlyPlayed(items: RecentlyPlayed[]): DayGroup[] {
  const dayGroupsMap: { [key: string]: RecentlyPlayed[] } = {}

  // Group by day label
  items.forEach(item => {
    if (!item.track) return
    const headerLabel = formatDateHeader(item.played_at)
    if (!dayGroupsMap[headerLabel]) {
      dayGroupsMap[headerLabel] = []
    }
    dayGroupsMap[headerLabel].push(item)
  })

  const result: DayGroup[] = []

  Object.keys(dayGroupsMap).forEach(dayLabel => {
    const dayItems = dayGroupsMap[dayLabel]
    // Sort items by played_at descending (latest played first)
    dayItems.sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())

    const sessions: Session[] = []
    let currentSessionTracks: Track[] = []
    let lastPlayTime: number | null = null

    const finalizeSession = (tracksInSession: Track[]) => {
      if (tracksInSession.length === 0) return
      
      const firstTrack = tracksInSession[0]
      const allSameAlbum = tracksInSession.every(t => t.album_id && t.album_id === firstTrack.album_id)
      const allSameArtist = tracksInSession.every(t => t.artist_id && t.artist_id === firstTrack.artist_id)

      let type: 'album' | 'artist' | 'mix' = 'mix'
      let name = 'Session'
      let subtitle = ''
      let covers: string[] = []

      // Extract unique covers
      const uniqueCoversSet = new Set<string>()
      tracksInSession.forEach(t => {
        if (t.cover_url) uniqueCoversSet.add(t.cover_url)
      })
      covers = Array.from(uniqueCoversSet)

      if (allSameAlbum && firstTrack.album_title) {
        type = 'album'
        name = firstTrack.album_title
        subtitle = `Album • ${tracksInSession.length} ${tracksInSession.length === 1 ? 'song' : 'songs'} played`
      } else if (allSameArtist && firstTrack.artist_name) {
        type = 'artist'
        name = firstTrack.artist_name
        subtitle = `Artist • ${tracksInSession.length} ${tracksInSession.length === 1 ? 'song' : 'songs'} played`
      } else {
        type = 'mix'
        if (firstTrack.artist_name) {
          name = `${firstTrack.artist_name} & more`
        } else {
          name = 'Music Session'
        }
        subtitle = `${tracksInSession.length} ${tracksInSession.length === 1 ? 'song' : 'songs'} played`
      }

      sessions.push({
        id: `${dayLabel}_session_${sessions.length}`,
        type,
        name,
        subtitle,
        tracks: tracksInSession,
        covers: covers.length ? covers : ['https://picsum.photos/100/100']
      })
    }

    dayItems.forEach(item => {
      const playTime = new Date(item.played_at).getTime()
      if (lastPlayTime === null) {
        currentSessionTracks.push(item.track!)
      } else {
        const diffMins = Math.abs(lastPlayTime - playTime) / 60000
        if (diffMins <= 20) {
          currentSessionTracks.push(item.track!)
        } else {
          finalizeSession(currentSessionTracks)
          currentSessionTracks = [item.track!]
        }
      }
      lastPlayTime = playTime
    })

    finalizeSession(currentSessionTracks)
    result.push({
      dayLabel,
      sessions
    })
  })

  return result
}

function StackedCovers({ covers, isCircle }: { covers: string[]; isCircle: boolean }) {
  if (isCircle) {
    return (
      <div className="w-10 h-10 flex-shrink-0">
        <img
          src={covers[0] || "https://picsum.photos/100/100"}
          alt=""
          className="w-10 h-10 rounded-full object-cover shadow-md border border-surface-highlight/30"
        />
      </div>
    )
  }

  return (
    <div className="relative w-14 h-10 flex-shrink-0 flex items-center">
      {covers.slice(0, 3).map((url, idx) => (
        <img
          key={idx}
          src={url || "https://picsum.photos/100/100"}
          alt=""
          className="absolute w-8 h-8 rounded shadow-md object-cover border border-surface-highlight/30"
          style={{
            left: `${idx * 6}px`,
            zIndex: 3 - idx,
            transform: `scale(${1 - idx * 0.08})`,
          }}
        />
      ))}
    </div>
  )
}

export default function RecentsPage() {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({})

  const setTrack = usePlayerStore((s) => s.setTrack)
  const setQueue = usePlayerStore((s) => s.setQueue)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)

  useEffect(() => {
    const load = async () => {
      try {
        const recent = await getRecentlyPlayed(0, 50)
        const groups = groupRecentlyPlayed(recent)
        setDayGroups(groups)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => ({
      ...prev,
      [sessionId]: !prev[sessionId]
    }))
  }

  const handlePlaySession = (e: React.MouseEvent, sessionTracks: Track[]) => {
    e.stopPropagation()
    if (sessionTracks.length === 0) return
    setQueue(sessionTracks)
    setTrack(sessionTracks[0])
    setIsPlaying(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24">
      <div className="flex items-center gap-3 mb-8">
        <History size={28} className="text-spotify-green" />
        <h1 className="text-3xl font-bold">Recently Played</h1>
      </div>

      {dayGroups.length === 0 ? (
        <div className="py-20 text-center text-subtext">
          <History size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No recently played tracks</p>
          <p className="text-sm mt-1">Start listening to build your recent history</p>
        </div>
      ) : (
        <div className="space-y-6">
          {dayGroups.map(group => (
            <div key={group.dayLabel} className="space-y-1">
              <h2 className="text-lg font-bold tracking-wide border-b border-surface-highlight/10 pb-1 mb-2">
                {group.dayLabel}
              </h2>
              
              <div className="space-y-0.5">
                {group.sessions.map(session => {
                  const isExpanded = !!expandedSessions[session.id]
                  return (
                    <div 
                      key={session.id} 
                      className="rounded-md overflow-hidden transition-all duration-200"
                    >
                      {/* Session Row Header */}
                      <div
                        onClick={() => toggleSession(session.id)}
                        className="flex items-center justify-between p-2 hover:bg-surface-highlight/10 rounded-md cursor-pointer select-none transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {/* Covers container with play button on hover */}
                          <div 
                            className="relative group/cover flex-shrink-0 cursor-pointer"
                            onClick={(e) => handlePlaySession(e, session.tracks)}
                          >
                            <StackedCovers covers={session.covers} isCircle={session.type === 'artist'} />
                            <div className="absolute inset-0 bg-black/40 rounded-md opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                              <Play size={16} className="text-white fill-white ml-0.5" />
                            </div>
                          </div>
                          
                          <div>
                            <h3 className="font-bold text-sm hover:underline leading-tight">
                              {session.name}
                            </h3>
                            <p className="text-subtext text-xs mt-0.5 font-medium">
                              {session.subtitle}
                            </p>
                          </div>
                        </div>

                        <div className="text-subtext hover:text-foreground p-1">
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>

                      {/* Expanded tracks sublist */}
                      {isExpanded && (
                        <div className="pl-14 pr-2 pb-2 bg-surface-highlight/5 rounded-b-md border-t border-surface-highlight/10">
                          <TrackList tracks={session.tracks} showHeader={false} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
