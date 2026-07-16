import { Link } from 'react-router-dom'
import { Home, Music2 } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Music2 size={64} className="text-spotify-green mb-6 opacity-50" />
      <h1 className="text-6xl font-bold mb-2">404</h1>
      <p className="text-lg text-subtext mb-8">
        This page doesn't exist — like a lost b-side.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-spotify-green text-black font-semibold text-sm hover:bg-spotify-green-hover transition-all hover:scale-[1.02]"
      >
        <Home size={16} />
        Back to Home
      </Link>
    </div>
  )
}
