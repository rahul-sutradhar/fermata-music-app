import { Play, Music } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Props {
  title: string
  subtitle?: string
  imageUrl?: string | null
  href?: string
  onPlay?: () => void
  isRound?: boolean
}

export default function Card({ title, subtitle, imageUrl, href, onPlay, isRound }: Props) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (href) navigate(href)
  }

  return (
    <button
      onClick={handleClick}
      className="group bg-surface-elevated/60 hover:bg-surface-highlight rounded-lg p-4 transition-all duration-300 cursor-pointer text-left w-full"
    >
      <div className="relative mb-4">
        <div
          className={`aspect-square bg-surface-highlight flex items-center justify-center overflow-hidden shadow-lg ${
            isRound ? 'rounded-full' : 'rounded-md'
          }`}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <Music size={48} className="text-subtext/50" />
          )}
        </div>
        {onPlay && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            className="absolute bottom-2 right-2 w-10 h-10 bg-spotify-green rounded-full flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:scale-105 hover:bg-spotify-green-hover"
          >
            <Play size={18} className="text-black ml-0.5" fill="currentColor" />
          </button>
        )}
      </div>
      <p className="text-sm font-semibold truncate">{title}</p>
      {subtitle && (
        <p className="text-xs text-subtext mt-1 truncate">{subtitle}</p>
      )}
    </button>
  )
}
