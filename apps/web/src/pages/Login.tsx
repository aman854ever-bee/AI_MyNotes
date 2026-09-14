import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { signInWithGoogle } from '../lib/googleSignIn'
import { IconGoogle } from '../components/icons'

const RESEND_COOLDOWN_SECONDS = 30

type Mode = 'email' | 'phone'

// E.164: a leading + followed by 8-15 digits, no spaces/dashes.
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null
}

export default function Login() {
  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)

  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendNotice, setResendNotice] = useState<string | null>(null)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    }
  }, [])

  function startCooldown() {
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    cooldownTimer.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  // Sends a fresh code/link on the active channel. Returns whether it succeeded.
  async function sendCode(): Promise<boolean> {
    if (!supabase) return false
    if (mode === 'phone') {
      const normalized = normalizePhone(phone)
      if (!normalized) {
        setError('Enter your number with country code, e.g. +91 98765 43210.')
        return false
      }
      const { error: signInError } = await supabase.auth.signInWithOtp({ phone: normalized })
      if (signInError) {
        setError(signInError.message)
        return false
      }
      return true
    }
    const { error: signInError } = await supabase.auth.signInWithOtp({ email })
    if (signInError) {
      setError(signInError.message)
      return false
    }
    return true
  }

  async function handleGoogleSignIn() {
    setGoogleError(null)
    setGoogleLoading(true)
    const result = await signInWithGoogle()
    // On the web this line is normally never reached — the browser has
    // already navigated away to Google by the time signInWithGoogle()
    // resolves. It only runs when something went wrong before that redirect
    // (e.g. Supabase rejected the request), or after openOAuthUrl() on native.
    setGoogleLoading(false)
    if (!result.ok) setGoogleError(result.message)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const ok = await sendCode()
    if (ok) {
      setSent(true)
      startCooldown()
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setResendNotice(null)
    setOtpError(null)
    const ok = await sendCode()
    if (ok) {
      setResendNotice(mode === 'phone' ? 'Sent again — check your messages.' : 'Sent again — check your email.')
      startCooldown()
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    if (!supabase || otp.trim().length === 0) return
    setOtpError(null)
    setVerifying(true)
    const { error: verifyError } =
      mode === 'phone'
        ? await supabase.auth.verifyOtp({
            phone: normalizePhone(phone) as string,
            token: otp.trim(),
            type: 'sms',
          })
        : await supabase.auth.verifyOtp({ email, token: otp.trim(), type: 'email' })
    setVerifying(false)
    if (verifyError) setOtpError(verifyError.message)
    // On success, the session updates via onAuthStateChange in App.tsx — nothing else to do here.
  }

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setSent(false)
    setError(null)
    setOtp('')
    setOtpError(null)
    setResendNotice(null)
    setResendCooldown(0)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
  }

  function useDifferentIdentifier() {
    setSent(false)
    setOtp('')
    setOtpError(null)
    setResendNotice(null)
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="page">
        <p className="muted">
          Add your Supabase keys to <code>apps/web/.env</code> to enable sign-in.
        </p>
      </div>
    )
  }

  if (sent) {
    const destination = mode === 'phone' ? phone.trim() : email
    return (
      <div className="page">
        <header className="home-header">
          <h1>Check your {mode === 'phone' ? 'messages' : 'email'}</h1>
          <p className="muted">
            We sent a 6-digit code {mode === 'phone' ? 'by SMS' : 'by email'} to <strong>{destination}</strong>.
          </p>
        </header>

        <form onSubmit={handleVerifyOtp} className="login-form">
          {mode === 'email' && (
            <p className="muted otp-lead">
              Link not opening, or showing an error? Enter the code from the same email instead.
            </p>
          )}
          <label htmlFor="otp">6-digit code</label>
          <input
            id="otp"
            className="otp-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="000000"
            autoFocus
          />
          <button type="submit" disabled={verifying || otp.trim().length === 0}>
            {verifying ? 'Verifying…' : 'Verify code'}
          </button>
          {otpError && <p className="error">{otpError}</p>}
        </form>

        <p className="otp-resend-row">
          <button
            type="button"
            className="link-btn"
            onClick={() => void handleResend()}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
          </button>
        </p>
        {resendNotice && <p className="muted">{resendNotice}</p>}

        <p className="otp-resend-row">
          <button type="button" className="link-btn" onClick={useDifferentIdentifier}>
            {mode === 'phone' ? 'Use a different number' : 'Use a different email'}
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="home-header">
        <h1>MyNotes</h1>
        <p className="muted">Sign in with your email or phone — no password to remember.</p>
      </header>

      <button
        type="button"
        className="google-signin-btn"
        onClick={() => void handleGoogleSignIn()}
        disabled={googleLoading}
      >
        <IconGoogle size={18} />
        {googleLoading ? 'Opening Google…' : 'Continue with Google'}
      </button>
      {googleError && <p className="error">{googleError}</p>}

      <div className="auth-divider"><span>or</span></div>

      <div className="auth-tabs" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'email'}
          className={mode === 'email' ? 'auth-tab active' : 'auth-tab'}
          onClick={() => switchMode('email')}
        >
          Email
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'phone'}
          className={mode === 'phone' ? 'auth-tab active' : 'auth-tab'}
          onClick={() => switchMode('phone')}
        >
          Phone
        </button>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        {mode === 'email' ? (
          <>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </>
        ) : (
          <>
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              required
            />
            <p className="muted otp-lead">Include your country code, e.g. +91 for India.</p>
          </>
        )}
        <button type="submit">Send code</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
