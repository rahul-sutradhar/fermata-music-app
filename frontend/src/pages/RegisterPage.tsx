import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Music2, Check, X, ShieldAlert, ShieldCheck, AlertCircle, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react'
import { apiRequest } from '@/api/client'

const REQUIREMENTS = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'One lowercase letter (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number (0-9)', test: (p: string) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special symbol (e.g. !@#$)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export default function RegisterPage() {
  const navigate = useNavigate()

  // Form Fields
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // State Management
  const [step, setStep] = useState(1) // 1 = details, 2 = otp, 3 = success
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [resendTimer, setResendTimer] = useState(0)

  // Turnstile state and refs
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)

  // Refs for 6-digit OTP code input boxes
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Timer logic for resend OTP countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const interval = setInterval(() => setResendTimer((t) => t - 1), 1000)
      return () => clearInterval(interval)
    }
  }, [resendTimer])

  // Turnstile widget initialization
  useEffect(() => {
    const renderTurnstile = () => {
      if (turnstileContainerRef.current && (window as any).turnstile && step === 1) {
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

    if (step === 1) {
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
    }

    return () => {
      if (widgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.remove(widgetIdRef.current)
        } catch (e) {}
      }
    }
  }, [step])

  // Live password requirements matching
  const metRequirements = REQUIREMENTS.filter((req) => req.test(password))
  const isPasswordStrong = metRequirements.length === REQUIREMENTS.length
  const passwordsMatch = password && password === confirmPassword

  // Calculate password strength rating
  const getStrengthLabel = () => {
    const count = metRequirements.length
    if (count === 0) return { label: 'Empty', color: 'bg-zinc-700', text: 'text-subtext' }
    if (count <= 2) return { label: 'Weak', color: 'bg-red-500', text: 'text-red-500' }
    if (count <= 4) return { label: 'Medium', color: 'bg-amber-500', text: 'text-amber-500' }
    return { label: 'Strong & Safe', color: 'bg-spotify-green', text: 'text-spotify-green' }
  }
  const strength = getStrengthLabel()

  // Step 1: Submit signup registration details
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isPasswordStrong || !passwordsMatch) return
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
      await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          full_name: fullName,
        }),
        headers: { 'X-CAPTCHA-Token': captchaToken },
      })
      // Successful registration initialization: Proceed to OTP validation
      setStep(2)
      setResendTimer(60)
    } catch (err: any) {
      setError(err.message || 'Registration failed')
      // Reset Turnstile on error so they can solve it again
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.reset(widgetIdRef.current)
      }
    } finally {
      setLoading(false)
    }
  }

  // OTP box input navigation and backspacing
  const handleOtpChange = (index: number, val: string) => {
    if (!/^[0-9]?$/.test(val)) return // accept single digit only
    const updated = [...otp]
    updated[index] = val
    setOtp(updated)

    // Move to next input box
    if (val && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      // Clear previous box and focus it
      const updated = [...otp]
      updated[index - 1] = ''
      setOtp(updated)
      otpRefs.current[index - 1]?.focus()
    }
  };

  // Step 2: Submit OTP code verification
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const otpCode = otp.join('')
    if (otpCode.length < 6) {
      setError('Please enter the complete 6-digit code.')
      return
    }

    setError('')
    setLoading(true)
    try {
      await apiRequest('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email,
          otp_code: otpCode,
        }),
      })
      setStep(3) // Proceed to registration success screen
    } catch (err: any) {
      setError(err.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  // Trigger verification immediately on typing 6th digit
  useEffect(() => {
    if (otp.join('').length === 6 && step === 2) {
      handleVerifyOtp()
    }
  }, [otp])

  // Resend OTP flow
  const handleResendOtp = async () => {
    if (resendTimer > 0) return
    setError('')
    const captchaToken = widgetIdRef.current && (window as any).turnstile
      ? (window as any).turnstile.getResponse(widgetIdRef.current)
      : null

    if (!captchaToken) {
      setError('Please complete the CAPTCHA to resend the code.')
      return
    }

    try {
      await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          full_name: fullName,
        }),
        headers: { 'X-CAPTCHA-Token': captchaToken },
      })
      setResendTimer(60)
      setOtp(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
    } catch (err: any) {
      setError(err.message || 'Resend failed')
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.reset(widgetIdRef.current)
      }
    }
  }


  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center p-4 page-transition overflow-y-auto py-8">
      <div className="w-full max-w-sm">
        {/* Logo Header */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-spotify-green flex items-center justify-center">
            <Music2 size={22} className="text-black" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-primary">Fermata</span>
        </div>

        {/* STEP 1: Registration Form */}
        {step === 1 && (
          <div className="bg-surface-elevated rounded-2xl p-8 border border-surface-highlight shadow-2xl relative overflow-hidden">
            <h1 className="text-2xl font-bold text-center mb-6">Create Account</h1>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center flex items-center justify-center gap-1.5">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleDetailsSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-subtext mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border border-transparent focus:border-spotify-green/45 transition-colors placeholder:text-subtext/40"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-subtext mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border border-transparent focus:border-spotify-green/45 transition-colors placeholder:text-subtext/40"
                  placeholder="Choose a username"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-subtext mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border border-transparent focus:border-spotify-green/45 transition-colors placeholder:text-subtext/40"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-subtext mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border border-transparent focus:border-spotify-green/45 transition-colors placeholder:text-subtext/40"
                  placeholder="Create a strong password"
                />

                {/* Password Strength Meter */}
                {password && (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-subtext">Password strength:</span>
                      <span className={`font-semibold ${strength.text}`}>{strength.label}</span>
                    </div>
                    {/* Strength Progress Segments */}
                    <div className="flex gap-1.5 h-1">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div
                          key={idx}
                          className={`flex-1 h-full rounded-full transition-all duration-300 ${
                            idx <= metRequirements.length ? strength.color : 'bg-zinc-800'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Requirements checklist */}
                    <ul className="text-xs text-subtext space-y-1 mt-3 bg-base/50 p-2.5 rounded-lg border border-surface-highlight/30">
                      {REQUIREMENTS.map((req) => {
                        const isMet = req.test(password)
                        return (
                          <li key={req.id} className="flex items-center gap-1.5 transition-colors duration-200">
                            {isMet ? (
                              <Check size={12} className="text-spotify-green flex-shrink-0" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-subtext/40 mx-1 flex-shrink-0" />
                            )}
                            <span className={isMet ? 'text-primary' : ''}>{req.label}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-subtext mb-1">
                  Re-enter Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={!password}
                  className="w-full px-4 py-2 rounded-lg bg-surface-highlight text-sm text-primary outline-none border border-transparent focus:border-spotify-green/45 transition-colors placeholder:text-subtext/40 disabled:opacity-40"
                  placeholder="Repeat your password"
                />
                {confirmPassword && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs">
                    {passwordsMatch ? (
                      <>
                        <ShieldCheck size={12} className="text-spotify-green" />
                        <span className="text-spotify-green">Passwords match</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert size={12} className="text-red-500" />
                        <span className="text-red-400">Passwords do not match</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div ref={turnstileContainerRef} className="flex justify-center my-3"></div>

              <button
                type="submit"
                disabled={loading || !isPasswordStrong || !passwordsMatch}
                className="w-full py-2.5 rounded-full bg-spotify-green text-black font-bold text-sm hover:bg-spotify-green-hover transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 mt-6 cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? 'Creating...' : 'Sign Up'}
              </button>
            </form>

            <div className="mt-6 text-center border-t border-surface-highlight/50 pt-4">
              <p className="text-xs text-subtext">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:text-spotify-green font-semibold underline transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: OTP Verification Card */}
        {step === 2 && (
          <div className="bg-surface-elevated rounded-2xl p-8 border border-surface-highlight shadow-2xl page-transition">
            <h1 className="text-2xl font-bold text-center mb-2">Verify Email</h1>
            <p className="text-xs text-subtext text-center mb-6">
              A 6-digit code has been sent to <span className="text-primary font-medium">{email}</span>.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            {/* Development OTP bypass banner */}
            <div className="mb-6 p-3 rounded-xl bg-spotify-green/10 border border-spotify-green/20 text-center flex flex-col items-center">
              <Sparkles size={16} className="text-spotify-green mb-1" />
              <span className="text-xs text-spotify-green font-semibold">Development Bypass Mode</span>
              <span className="text-[10px] text-subtext">Enter test code <strong className="text-primary">123456</strong> to verify.</span>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-6">
              {/* 6-digit OTP Inputs grid */}
              <div className="flex gap-2.5 justify-center">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    type="text"
                    maxLength={1}
                    value={digit}
                    ref={(el) => { otpRefs.current[idx] = el }}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-11 h-12 text-center text-lg font-bold rounded-lg bg-surface-highlight text-primary outline-none border border-transparent focus:border-spotify-green transition-colors focus:bg-surface"
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading || otp.join('').length < 6}
                className="w-full py-2.5 rounded-full bg-spotify-green text-black font-bold text-sm hover:bg-spotify-green-hover transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>

            <div className="mt-6 text-center space-y-4 pt-4 border-t border-surface-highlight/50">
              {resendTimer === 0 && (
                <div ref={turnstileContainerRef} className="flex justify-center my-3"></div>
              )}
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendTimer > 0}
                className="text-xs font-semibold text-primary hover:text-spotify-green transition-colors disabled:text-subtext/50 disabled:cursor-not-allowed"
              >
                {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend Verification Code'}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="block w-full text-xs text-subtext hover:text-primary transition-colors underline"
              >
                Edit registration details
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Success Confirmation */}
        {step === 3 && (
          <div className="bg-surface-elevated rounded-2xl p-8 border border-surface-highlight shadow-2xl text-center page-transition">
            <div className="w-16 h-16 bg-spotify-green/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-spotify-green/30 animate-pulse">
              <CheckCircle2 size={36} className="text-spotify-green" />
            </div>

            <h1 className="text-2xl font-bold mb-3">All Set!</h1>
            <p className="text-sm text-subtext mb-8">
              Your account has been created successfully. Welcome to Fermata!
            </p>

            <button
              onClick={() => navigate('/login')}
              className="w-full py-2.5 rounded-full bg-spotify-green text-black font-bold text-sm hover:bg-spotify-green-hover transition-all hover:scale-[1.02] cursor-pointer"
            >
              Proceed to Login
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
