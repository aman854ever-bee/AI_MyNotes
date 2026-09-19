import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { signInWithGoogle } from '../lib/googleSignIn'
import { normalizePhone, formatCooldown } from '../lib/format'
import { IconGoogle, IconMail, IconPhone, IconBack, IconSparkle, IconShieldCheck, IconLock } from '../components/icons'

const RESEND_COOLDOWN_SECONDS = 30
const OTP_LENGTH = 6

type Mode = 'email' | 'phone'

export default function Login() {
  const [mode, setMode] = useState<Mode>('phone')
  const [email, setEmail] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const otpRefs = useRef<Array<HTMLInputElement | null>>([])

  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendNotice, setResendNotice] = useState<string | null>(null)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    }
  }, [])

  const fullPhone = `${countryCode.trim()}${phoneNumber.replace(/[^0-9]/g, '')}`

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
      const normalized = normalizePhone(fullPhone)
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
    if (!supabase || otp.trim().length < OTP_LENGTH) return
    setOtpError(null)
    setVerifying(true)
    const { error: verifyError } =
      mode === 'phone'
        ? await supabase.auth.verifyOtp({
            phone: normalizePhone(fullPhone) as string,
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
    setError(null)
  }

  function resetVerifyState() {
    setSent(false)
    setOtp('')
    setOtpError(null)
    setResendNotice(null)
    setResendCooldown(0)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
  }

  // Back chevron on the verify screen — keeps what was typed so a typo is a quick edit, not a redo.
  function goBackToEntry() {
    resetVerifyState()
  }

  // "Use a different number/email" — explicit intent to start over with a new identifier.
  function useDifferentIdentifier() {
    resetVerifyState()
    if (mode === 'phone') setPhoneNumber('')
    else setEmail('')
  }

  const otpDigits = Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '')

  function handleOtpChange(index: number, raw: string) {
    const digits = raw.replace(/[^0-9]/g, '')
    const next = otpDigits.slice()
    if (digits.length > 1) {
      // Handles pasting a full code into one box.
      for (let i = 0; i < digits.length && index + i < OTP_LENGTH; i++) {
        next[index + i] = digits[i]
      }
      setOtp(next.join(''))
      const lastIndex = Math.min(index + digits.length, OTP_LENGTH - 1)
      otpRefs.current[lastIndex]?.focus()
      return
    }
    next[index] = digits
    setOtp(next.join(''))
    if (digits && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      e.preventDefault()
      const next = otpDigits.slice()
      next[index - 1] = ''
      setOtp(next.join(''))
      otpRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus()
    }
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
    const destination = mode === 'phone' ? fullPhone : email
    return (
      <div className="verify-screen">
        <div className="verify-header">
          <button type="button" className="verify-back-btn" onClick={goBackToEntry} aria-label="Back">
            <IconBack size={20} />
          </button>
          <h1>Check your {mode === 'phone' ? 'messages' : 'email'}</h1>
        </div>

        <div className="verify-intro">
          <div className="verify-security-icon">
            <IconShieldCheck size={28} />
          </div>
          <p className="verify-lead">
            We sent a 6-digit code {mode === 'phone' ? 'by SMS' : 'by email'} to <strong>{destination}</strong>. It expires in 10 minutes.
          </p>
        </div>

        <form onSubmit={handleVerifyOtp}>
          <div className="otp-digits">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el
                }}
                className={digit ? 'otp-digit filled' : 'otp-digit'}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={i === 0 ? OTP_LENGTH : 1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                autoFocus={i === 0}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
              />
            ))}
          </div>

          {otpError && <p className="error" style={{ marginTop: 14 }}>{otpError}</p>}

          <button
            type="submit"
            className="verify-primary-btn"
            style={{ marginTop: 16 }}
            disabled={verifying || otp.trim().length < OTP_LENGTH}
          >
            {verifying ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>

        <p className="verify-resend">
          {resendCooldown > 0 ? (
            <>Resend code in <strong>{formatCooldown(resendCooldown)}</strong></>
          ) : (
            <button type="button" className="verify-resend-btn" onClick={() => void handleResend()}>
              Resend code
            </button>
          )}
        </p>
        {resendNotice && <p className="verify-notice">{resendNotice}</p>}

        <div className="verify-protect-card">
          <div className="verify-protect-icon">
            <IconLock size={18} />
          </div>
          <div className="verify-protect-copy">
            <p className="verify-protect-title">Your account stays protected</p>
            <p className="verify-protect-sub">We use encrypted verification and never share your number.</p>
          </div>
        </div>

        <p className="verify-alt-row">
          <button type="button" className="verify-alt-link" onClick={useDifferentIdentifier}>
            {mode === 'phone' ? 'Use a different number' : 'Use a different email'}
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="welcome-screen">
      <div className="brand-mark">
        <IconSparkle size={29} />
      </div>
      <p className="brand-label">MyNotes</p>
      <h1>Your thoughts, meetings, and next moves—made clear.</h1>
      <p className="welcome-sub">AI-powered notes that listen, organize, and turn every conversation into action.</p>

      <div className="login-panel">
        <h2>Welcome back</h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="identifier-field">
            {mode === 'phone' ? (
              <>
                <input
                  className="cc-input"
                  type="tel"
                  inputMode="tel"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  aria-label="Country code"
                />
                <div className="cc-divider" />
                <input
                  className="id-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="98765 43210"
                  aria-label="Phone number"
                  required
                />
              </>
            ) : (
              <input
                className="id-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email"
                required
              />
            )}
          </div>

          <button type="submit" className="welcome-primary-btn">
            {mode === 'phone' ? 'Continue with phone' : 'Continue with email'}
          </button>
          {error && <p className="welcome-error">{error}</p>}
        </form>

        <div className="welcome-divider-label">OR</div>

        <button
          type="button"
          className="welcome-secondary-btn"
          onClick={() => void handleGoogleSignIn()}
          disabled={googleLoading}
        >
          <IconGoogle size={18} />
          {googleLoading ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {googleError && <p className="welcome-error">{googleError}</p>}

        <button type="button" className="welcome-secondary-btn" onClick={() => switchMode(mode === 'phone' ? 'email' : 'phone')}>
          {mode === 'phone' ? (
            <>
              <IconMail size={18} />
              Continue with email
            </>
          ) : (
            <>
              <IconPhone size={18} />
              Continue with phone
            </>
          )}
        </button>

        <p className="welcome-more-note">More sign-in options · SSO</p>
      </div>

      <p className="welcome-footer">By continuing, you agree to our Terms and Privacy Policy.</p>
    </div>
  )
}
