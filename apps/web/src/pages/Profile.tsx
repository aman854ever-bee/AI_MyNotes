import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface ProfileProps {
  session: Session | null
}

export default function Profile({ session }: ProfileProps) {
  const identifier = session?.user.email ?? session?.user.phone ?? null

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <div className="page">
      <header className="home-header">
        <h1>Profile</h1>
        <p className="muted">{identifier ? `Signed in as ${identifier}` : 'Your account details.'}</p>
      </header>

      <div className="empty-state">
        <p>Profile settings are coming soon.</p>
        <p className="muted">For now, you can sign out below.</p>
      </div>

      {supabase && (
        <button type="button" className="delete-btn" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      )}
    </div>
  )
}
