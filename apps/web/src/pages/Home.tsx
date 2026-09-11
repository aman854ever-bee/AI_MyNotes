import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { listNotes, type LocalNote } from '../lib/db'
import { relativeDate } from '../lib/format'
import { IconPlus } from '../components/icons'

interface HomeProps {
  onOpenNote: (id: string) => void
  onOpenNotesList: () => void
  onCapture: () => void
}

export default function Home({ onOpenNote, onOpenNotesList, onCapture }: HomeProps) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    listNotes().then((n) => {
      if (cancelled) return
      setNotes(n)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const recent = notes.slice(0, 4)

  return (
    <div className="page">
      {!isSupabaseConfigured && (
        <div className="banner">
          Connect Supabase to sync across devices — add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>apps/web/.env</code>. Notes save locally either way.
        </div>
      )}

      <div className="hero">
        <div>
          <p className="greeting">{greeting} 👋</p>
          <h1>Today</h1>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="n">{notes.length}</span>
            <span className="l">{notes.length === 1 ? 'Note' : 'Notes'}</span>
          </div>
        </div>
      </div>

      <div>
        <p className="section-label">Recent</p>

        {loaded && recent.length === 0 && (
          <div className="empty-state">
            <p>Nothing here yet.</p>
            <p className="muted">Capture your first note to get started.</p>
          </div>
        )}

        {recent.length > 0 && (
          <div className="group">
            {recent.map((note) => (
              <button key={note.id} className="row" type="button" onClick={() => onOpenNote(note.id)}>
                <span className="t">{note.title || 'Untitled'}</span>
                <span className="m">{relativeDate(note.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}

        {notes.length > 4 && (
          <button className="link-row" type="button" onClick={onOpenNotesList} style={{ marginTop: 10 }}>
            See all {notes.length} notes
          </button>
        )}
      </div>

      <button className="capture-btn" type="button" onClick={onCapture}>
        <IconPlus />
        Capture
      </button>
    </div>
  )
}
