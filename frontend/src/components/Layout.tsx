import { Outlet, NavLink } from 'react-router-dom'
import { Home, Search, Library } from 'lucide-react'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import { useAuthStore } from '@/store/authStore'

export default function Layout() {
  const token = useAuthStore((s) => s.token)

  return (
    <div className="flex flex-col h-screen bg-base text-primary overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface">
          <div className="p-4 md:p-6 pb-32 md:pb-32">
            <Outlet />
          </div>
        </main>
      </div>
      
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
