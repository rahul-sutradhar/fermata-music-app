import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'

export default function Layout() {
  return (
    <div className="flex flex-col h-screen bg-base text-primary overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-surface">
          <div className="p-6 pb-32">
            <Outlet />
          </div>
        </main>
      </div>
      <NowPlayingBar />
    </div>
  )
}
