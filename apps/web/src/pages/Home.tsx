import { isSupabaseConfigured } from '../lib/supabaseClient'

export default function Home() {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="page">
      {!isSupabaseConfigured && (
        <div className="banner">
          Connect Supabase to start syncing — add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>apps/web/.env</code>.
        </div>
      )}

      <header className="home-header">
        <p className="greeting">{greeting} 👋</p>
        <h1>Today</h1>
      </header>

      <section className="empty-state">
        <p>Nothing needs your attention yet.</p>
        <p className="muted">Capture your first note, voice memo, or meeting to get started.</p>
      </section>

      <button className="capture-btn" type="button">
        + Capture
      </button>
    </div>
  )
}
