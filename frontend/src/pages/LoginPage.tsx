import { useState, useEffect, useRef } from 'react'
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

  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    const renderTurnstile = () => {
      if (turnstileContainerRef.current && (window as any).turnstile) {
        if (widgetIdRef.current) {
          try {
            (window as any).turnstile.remove(widgetIdRef.current)
          } catch (e) {}
        }
        try {
          widgetIdRef.current = (window as any).turnstile.render(turnstileContainerRef.current, {
            sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
            theme: 'dark',
          })
        } catch (err) {
          console.error("Turnstile render error:", err)
        }
      }
    }

    if ((window as any).turnstile) {
      renderTurnstile()
    } else {
      const interval = setInterval(() => {
        if ((window as any).turnstile) {
          renderTurnstile()
          clearInterval(interval)
        }
      }, 500)
      return () => clearInterval(interval)
    }

    return () => {
      if (widgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.remove(widgetIdRef.current)
        } catch (e) {}
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const captchaToken = widgetIdRef.current && (window as any).turnstile
      ? (window as any).turnstile.getResponse(widgetIdRef.current)
      : null

    if (!captchaToken) {
      setError('Please complete the CAPTCHA.')
      setLoading(false)
      return
    }

    try {
      const res = await login(username, password, captchaToken)
      setAuth(res.access_token, res.refresh_token)

      // Fetch user info
      const user = await getMe()
      setUser(user)

      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Login failed')
      // Reset Turnstile on error so they can solve it again
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.reset(widgetIdRef.current)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center p-4 overflow-y-auto py-8">
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

            <div ref={turnstileContainerRef} className="flex justify-center my-4"></div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-spotify-green text-accent-text font-bold text-sm hover:bg-spotify-green-hover transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 mt-6"
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
