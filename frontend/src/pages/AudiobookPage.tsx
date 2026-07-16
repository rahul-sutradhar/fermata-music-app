import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BookOpen, Play } from 'lucide-react'
import { getAudiobook, getAudiobookChapters } from '@/api/content'
import type { Audiobook, Chapter } from '@/types'

export default function AudiobookPage() {
  const { id } = useParams<{ id: string }>()
  const [audiobook, setAudiobook] = useState<Audiobook | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const [abData, chapterData] = await Promise.all([
          getAudiobook(Number(id)),
          getAudiobookChapters(Number(id), 0, 100),
        ])
        setAudiobook(abData)
        setChapters(chapterData.sort((a, b) => a.chapter_number - b.chapter_number))
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

  if (!audiobook) {
    return (
      <div className="py-20 text-center text-subtext">
        <p className="text-lg">Audiobook not found</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end gap-6 mb-8">
        <div className="w-48 h-48 rounded-lg bg-surface-highlight flex items-center justify-center shadow-2xl shrink-0 overflow-hidden">
          {audiobook.image_url ? (
            <img src={audiobook.image_url} alt={audiobook.title} className="w-full h-full object-cover" />
          ) : (
            <BookOpen size={64} className="text-subtext/40" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-subtext mb-1">Audiobook</p>
          <h1 className="text-4xl font-bold mb-2 truncate">{audiobook.title}</h1>
          {audiobook.author && (
            <p className="text-sm text-subtext">By {audiobook.author}</p>
          )}
          {audiobook.description && (
            <p className="text-sm text-subtext mt-1 line-clamp-2">{audiobook.description}</p>
          )}
        </div>
      </div>

      {/* Chapters */}
      <h2 className="text-xl font-bold mb-4">Chapters</h2>
      {chapters.length === 0 ? (
        <div className="py-12 text-center text-subtext">
          <p className="text-sm">No chapters yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {chapters.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center gap-4 p-4 rounded-lg hover:bg-surface-highlight/50 transition-colors group"
            >
              <span className="text-sm text-subtext w-8 text-center tabular-nums">
                {ch.chapter_number}
              </span>
              <div className="w-10 h-10 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                <Play size={16} className="text-subtext group-hover:text-primary ml-0.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ch.title}</p>
                {ch.description && (
                  <p className="text-xs text-subtext truncate mt-0.5">{ch.description}</p>
                )}
              </div>
              <span className="text-xs text-subtext tabular-nums">
                {Math.floor(ch.duration_ms / 60000)} min
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
