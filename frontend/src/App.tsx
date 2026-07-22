import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useThemeStore } from '@/store/themeStore'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import SearchPage from '@/pages/SearchPage'
import LibraryPage from '@/pages/LibraryPage'
import AlbumPage from '@/pages/AlbumPage'
import ArtistPage from '@/pages/ArtistPage'
import PlaylistPage from '@/pages/PlaylistPage'
import ShowPage from '@/pages/ShowPage'
import AudiobookPage from '@/pages/AudiobookPage'
import ProfilePage from '@/pages/ProfilePage'
import AdminRoute from '@/components/AdminRoute'
import AdminPanelPage from '@/pages/AdminPanelPage'
import ArtistRoute from '@/components/ArtistRoute'
import ArtistPanelPage from '@/pages/ArtistPanelPage'
import RecentsPage from '@/pages/RecentsPage'
import NotFound from '@/pages/NotFound'
import ReportMissingPage from '@/pages/ReportMissingPage'

export default function App() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }, [theme])

  return (
    <HashRouter>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="report-missing" element={<ReportMissingPage />} />
        <Route path="album/:id" element={<AlbumPage />} />
        <Route path="artist/:id" element={<ArtistPage />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="show/:id" element={<ShowPage />} />
        <Route path="audiobook/:id" element={<AudiobookPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="library" element={<LibraryPage />} />
          <Route path="recents" element={<RecentsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route element={<ArtistRoute />}>
          <Route path="artist-panel" element={<ArtistPanelPage />} />
          <Route path="artist-studio" element={<ArtistPanelPage />} />
        </Route>

        <Route element={<AdminRoute />}>
          <Route path="admin" element={<AdminPanelPage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </HashRouter>
  )
}

