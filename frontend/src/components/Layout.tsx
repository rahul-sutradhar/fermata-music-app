import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Home, Search, Library, X, Sun, Moon, User, Plus } from 'lucide-react'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

export default function Layout() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const { theme, toggleTheme } = useThemeStore()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const navigate = useNavigate()

  const handleCreateClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!token) {
      navigate('/login')
      return
    }
    // Dispatch the custom event to open the modal in Sidebar
    window.dispatchEvent(new Event('open-create-playlist-modal'))
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-base text-primary overflow-hidden">
      {/* Mobile Top Header Bar */}
      <header className="flex md:hidden items-center justify-between px-4 h-14 bg-base border-b border-surface-highlight shrink-0">
        {/* Left: Profile / Account Icon to Open Sidebar */}
        <button 
          onClick={() => setIsMobileSidebarOpen(true)}
          className="w-8 h-8 rounded-full bg-surface-highlight flex items-center justify-center text-xs font-bold text-spotify-green hover:scale-105 transition-transform cursor-pointer"
          title="Open Menu"
        >
          {token && user ? (
            user.username.charAt(0).toUpperCase()
          ) : (
            <User size={18} className="text-subtext" />
          )}
        </button>
        
        <span className="text-md font-bold tracking-tight">Fermata</span>
        
        {/* Right: Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-surface-highlight text-subtext hover:text-primary transition-colors cursor-pointer"
          title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex w-72 shrink-0">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto bg-surface">
          <div className="p-4 md:p-6 pb-40 md:pb-32">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Mobile Sidebar Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden h-screen h-[100dvh]">
          {/* Backdrop blur overlay */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          
          {/* Drawer Content */}
          <div className="z-10 relative flex flex-col w-72 h-screen h-[100dvh] bg-base shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Close Button */}
            <div className="absolute top-4 right-4 z-10">
              <button 
                onClick={() => setIsMobileSidebarOpen(false)}
                className="p-2 rounded-full hover:bg-surface-highlight text-subtext hover:text-primary transition-colors"
                title="Close Menu"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Sidebar content (closes menu on item click) */}
            <div className="h-full" onClick={() => setIsMobileSidebarOpen(false)}>
              <Sidebar />
            </div>
          </div>
        </div>
      )}

      {/* Footer controls & Mobile navigation container */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col bg-base shrink-0">
        <NowPlayingBar />
        
        {/* Mobile Bottom Navigation Bar */}
        <nav className="flex md:hidden items-center justify-around h-16 bg-base border-t border-surface-highlight pb-safe">
          <NavLink 
            to="/" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center gap-1 text-[10px] font-medium w-20 transition-colors ${
                isActive ? 'text-spotify-green' : 'text-subtext'
              }`
            }
            end
          >
            <Home size={20} />
            <span>Home</span>
          </NavLink>
          
          <NavLink 
            to="/search" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center gap-1 text-[10px] font-medium w-20 transition-colors ${
                isActive ? 'text-spotify-green' : 'text-subtext'
              }`
            }
          >
            <Search size={20} />
            <span>Search</span>
          </NavLink>
          
          <NavLink 
            to="/library" 
            className={({ isActive }) => 
              `flex flex-col items-center justify-center gap-1 text-[10px] font-medium w-20 transition-colors ${
                isActive ? 'text-spotify-green' : 'text-subtext'
              }`
            }
            onClick={(e) => {
              if (!token) {
                e.preventDefault()
                navigate('/login')
              }
            }}
          >
            <Library size={20} />
            <span>Your Library</span>
          </NavLink>
          
          <button 
            onClick={handleCreateClick}
            className="flex flex-col items-center justify-center gap-1 text-[10px] font-medium w-20 text-subtext hover:text-primary transition-colors cursor-pointer"
          >
            <Plus size={20} />
            <span>Create</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
