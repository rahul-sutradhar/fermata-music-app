import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Music2 } from 'lucide-react'
import { login } from '@/api/auth'
import { getMe } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setUser = useAuthStore((s) => s.setUser)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await login(username, password)
      setAuth(res.access_token, res.refresh_token)

      // Fetch user info
      const user = await getMe()
      setUser(user)

      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-spotify-green flex items-center justify-center">
            <Music2 size={22} className="text-black" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-primary">Fermata</span>
        </div>

        <div className="bg-surface-elevated rounded-2xl p-8 border border-surface-highlight shadow-2xl">
          <h1 className="text-2xl font-bold text-center mb-8">Sign in</h1>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-subtext mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors placeholder:text-subtext/50"
                placeholder="Your username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-subtext mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg bg-surface-highlight text-sm text-primary outline-none border-2 border-transparent focus:border-spotify-green/50 transition-colors placeholder:text-subtext/50"
                placeholder="Your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-spotify-green text-black font-bold text-sm hover:bg-spotify-green-hover transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 mt-6"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-subtext">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary hover:text-spotify-green underline transition-colors">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
