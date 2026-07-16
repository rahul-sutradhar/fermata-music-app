import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Radio, Play } from 'lucide-react'
import { getShow, getShowEpisodes } from '@/api/content'
import type { Show, Episode } from '@/types'

export default function ShowPage() {
  const { id } = useParams<{ id: string }>()
  const [show, setShow] = useState<Show | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const [showData, episodeData] = await Promise.all([
          getShow(Number(id)),
          getShowEpisodes(Number(id), 0, 50),
        ])
        setShow(showData)
        setEpisodes(episodeData)
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

  if (!show) {
    return (
      <div className="py-20 text-center text-subtext">
        <p className="text-lg">Show not found</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end gap-6 mb-8">
        <div className="w-48 h-48 rounded-lg bg-surface-highlight flex items-center justify-center shadow-2xl shrink-0 overflow-hidden">
          {show.image_url ? (
            <img src={show.image_url} alt={show.title} className="w-full h-full object-cover" />
          ) : (
            <Radio size={64} className="text-subtext/40" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-subtext mb-1">Podcast</p>
          <h1 className="text-4xl font-bold mb-2 truncate">{show.title}</h1>
          {show.description && (
            <p className="text-sm text-subtext line-clamp-2">{show.description}</p>
          )}
        </div>
      </div>

      {/* Episodes */}
      <h2 className="text-xl font-bold mb-4">All Episodes</h2>
      {episodes.length === 0 ? (
        <div className="py-12 text-center text-subtext">
          <p className="text-sm">No episodes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {episodes.map((ep) => (
            <div
              key={ep.id}
              className="flex items-center gap-4 p-4 rounded-lg hover:bg-surface-highlight/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                <Play size={16} className="text-subtext group-hover:text-primary ml-0.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ep.title}</p>
                {ep.description && (
                  <p className="text-xs text-subtext truncate mt-0.5">{ep.description}</p>
                )}
              </div>
              <span className="text-xs text-subtext tabular-nums">
                {Math.floor(ep.duration_ms / 60000)} min
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
