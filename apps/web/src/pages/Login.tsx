import { useState, type FormEvent } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const { error: signInError } = await supabase.auth.signInWithOtp({ email })
    if (signInError) setError(signInError.message)
    else setSent(true)
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
        <p>Check <strong>{email}</strong> for a sign-in link.</p>
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
