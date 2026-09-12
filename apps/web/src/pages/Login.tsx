import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

const RESEND_COOLDOWN_SECONDS = 30

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function sendLink() {
    if (!supabase) return false
    const { error: signInError } = await supabase.auth.signInWithOtp({ email })
    if (signInError) {
      setError(signInError.message)
      return false
    }
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const ok = await sendLink()
    if (ok) {
      setSent(true)
      startCooldown()
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setResendNotice(null)
    setOtpError(null)
    const ok = await sendLink()
    if (ok) {
      setResendNotice('Sent again — check your email.')
      startCooldown()
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    if (!supabase || otp.trim().length === 0) return
    setOtpError(null)
    setVerifying(true)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: 'email',
    })
    setVerifying(false)
    if (verifyError) setOtpError(verifyError.message)
    // On success, the session updates via onAuthStateChange in App.tsx — nothing else to do here.
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="page">
        <p className="muted">Add your Supabase keys to <code>apps/web/.env</code> to enable sign-in.</p>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="page">
        <header className="home-header">
          <h1>Check your email</h1>
          <p className="muted">We sent a sign-in link to <strong>{email}</strong>.</p>
        </header>

        <form onSubmit={handleVerifyOtp} className="login-form">
          <p className="muted otp-lead">
            Link not opening, or showing an error? Enter the code from the same email instead.
          </p>
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
            {resendCooldown > 0 ? `Resend email (${resendCooldown}s)` : 'Resend email'}
          </button>
        </p>
        {resendNotice && <p className="muted">{resendNotice}</p>}

        <p className="otp-resend-row">
          <button type="button" className="link-btn" onClick={() => { setSent(false); setOtp(''); setOtpError(null); setResendNotice(null) }}>
            Use a different email
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="home-header">
        <h1>MyNotes</h1>
        <p className="muted">Sign in with your email — no password to remember.</p>
      </header>
      <form onSubmit={handleSubmit} className="login-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <button type="submit">Send sign-in link</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
