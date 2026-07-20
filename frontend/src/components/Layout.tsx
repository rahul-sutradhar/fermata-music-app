import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Home, Search, Library, Menu, X, Sun, Moon } from 'lucide-react'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

export default function Layout() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const { theme, toggleTheme } = useThemeStore()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  return (
    <div className="flex flex-col h-screen bg-base text-primary overflow-hidden">
      {/* Mobile Top Header Bar */}
      <header className="flex md:hidden items-center justify-between px-4 h-14 bg-base border-b border-surface-highlight shrink-0">
        <button 
          onClick={() => setIsMobileSidebarOpen(true)}
          className="p-2 -ml-2 rounded-full hover:bg-surface-highlight text-subtext hover:text-primary transition-colors"
          title="Open Menu"
        >
          <Menu size={22} />
        </button>
        
        <span className="text-md font-bold tracking-tight">Fermata</span>
        
        {/* Right controls: Theme Toggle + Profile Avatar */}
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-surface-highlight text-subtext hover:text-primary transition-colors"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          {token && user ? (
            <NavLink to="/profile" className="w-8 h-8 rounded-full bg-surface-highlight flex items-center justify-center text-xs font-bold text-spotify-green hover:scale-105 transition-transform">
              {user.username.charAt(0).toUpperCase()}
            </NavLink>
          ) : (
            <NavLink to="/login" className="text-xs text-spotify-green font-semibold">
              Sign in
            </NavLink>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface">
          <div className="p-4 md:p-6 pb-32 md:pb-32">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Mobile Sidebar Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop blur overlay */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          
          {/* Drawer Content */}
          <div className="relative flex flex-col w-72 h-full bg-base shadow-2xl animate-in slide-in-from-left duration-200">
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
      <div className="flex flex-col shrink-0">
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
          {token && (
            <NavLink 
              to="/library" 
              className={({ isActive }) => 
                `flex flex-col items-center justify-center gap-1 text-[10px] font-medium w-20 transition-colors ${
                  isActive ? 'text-spotify-green' : 'text-subtext'
                }`
              }
            >
              <Library size={20} />
              <span>Library</span>
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  )
}
