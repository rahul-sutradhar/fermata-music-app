import { usePlayerStore } from '@/store/playerStore'
import { X, Play, Pause, SkipForward, SkipBack, Music } from 'lucide-react'

export default function ExpandedPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isExpanded = usePlayerStore((s) => s.isExpanded)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrevious = usePlayerStore((s) => s.playPrevious)

  if (!isExpanded || !currentTrack) return null

  return (
    <div className="fixed inset-0 z-50 bg-[#121212] text-white flex flex-col animate-in slide-in-from-bottom duration-300 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 shrink-0 bg-black/40 backdrop-blur-md">
        <button
          onClick={() => usePlayerStore.setState({ isExpanded: false })}
          className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="Minimize"
        >
          <X size={24} />
        </button>
        <span className="text-sm font-bold tracking-wider uppercase text-zinc-400">Now Playing</span>
        <div className="w-10 h-10" /> {/* Spacer */}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full p-6 flex flex-col md:flex-row gap-8 items-center md:items-stretch min-h-0">
        {/* Left Panel: Cover & Controls */}
        <div className="flex-1 flex flex-col justify-center items-center max-w-md w-full gap-8 shrink-0">
          <div className="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800/80 bg-zinc-900 flex items-center justify-center shrink-0">
            {currentTrack.cover_url ? (
              <img src={currentTrack.cover_url} alt={currentTrack.title} className="w-full h-full object-cover" />
            ) : (
              <Music size={128} className="text-zinc-700" />
            )}
          </div>

          <div className="text-center w-full min-w-0">
            <h1 className="text-2xl font-bold truncate">{currentTrack.title}</h1>
            <p className="text-zinc-400 text-sm mt-1 truncate">{currentTrack.artist_name || 'Unknown Artist'}</p>
          </div>

          {/* Simple controls inline for full-screen focus */}
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="flex items-center justify-center gap-6">
              <button 
                onClick={() => playPrevious()} 
                className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
                title="Previous Track"
              >
                <SkipBack size={28} fill="currentColor" />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-14 h-14 bg-white hover:bg-zinc-200 text-black rounded-full flex items-center justify-center transition-transform hover:scale-105 cursor-pointer shadow-lg"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" className="ml-1" />}
              </button>
              <button 
                onClick={() => playNext(true)} 
                className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
                title="Next Track"
              >
                <SkipForward size={28} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Scrollable Lyrics */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#181818] rounded-2xl border border-zinc-800 p-6 md:p-8 shadow-inner max-h-[500px] md:max-h-none overflow-hidden">
          <h2 className="text-lg font-bold text-spotify-green mb-4 flex items-center gap-2 shrink-0">
            <Music size={18} />
            Lyrics
          </h2>
          <div className="flex-1 overflow-y-auto scrollbar-thin text-zinc-300 font-medium text-lg leading-loose pr-2 select-text whitespace-pre-line">
            {currentTrack.lyrics ? (
              currentTrack.lyrics
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm italic">
                Lyrics not available for this song.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
