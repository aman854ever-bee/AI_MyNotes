import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { listNotes, listVoiceNotes, type LocalNote, type LocalVoiceNote } from '../lib/db'
import { relativeDate, formatDuration } from '../lib/format'
import { IconDoc, IconMic, IconPlus } from '../components/icons'

interface HomeProps {
  onOpenNote: (id: string) => void
  onOpenVoiceNote: (id: string) => void
  onOpenNotesList: () => void
  onCapture: () => void
}

type RecentItem =
  | { kind: 'note'; updatedAt: string; note: LocalNote }
  | { kind: 'voice'; updatedAt: string; voiceNote: LocalVoiceNote }

export default function Home({ onOpenNote, onOpenVoiceNote, onOpenNotesList, onCapture }: HomeProps) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [voiceNotes, setVoiceNotes] = useState<LocalVoiceNote[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listNotes(), listVoiceNotes()]).then(([n, v]) => {
      if (cancelled) return
      setNotes(n)
      setVoiceNotes(v)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const items: RecentItem[] = [
    ...notes.map((note): RecentItem => ({ kind: 'note', updatedAt: note.updatedAt, note })),
    ...voiceNotes.map((voiceNote): RecentItem => ({ kind: 'voice', updatedAt: voiceNote.updatedAt, voiceNote })),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const recent = items.slice(0, 4)
  const totalCount = notes.length + voiceNotes.length

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
            <span className="n">{totalCount}</span>
            <span className="l">{totalCount === 1 ? 'Item' : 'Items'}</span>
          </div>
          {voiceNotes.length > 0 && (
            <div className="hero-stat">
              <span className="n">{voiceNotes.length}</span>
              <span className="l">{voiceNotes.length === 1 ? 'Voice note' : 'Voice notes'}</span>
            </div>
          )}
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
            {recent.map((item) =>
              item.kind === 'note' ? (
                <button key={item.note.id} className="row" type="button" onClick={() => onOpenNote(item.note.id)}>
                  <span className="t">
                    <span className="voice-row-icon" style={{ marginRight: 6 }}>
                      <IconDoc size={14} />
                    </span>
                    {item.note.title || 'Untitled'}
                  </span>
                  <span className="m">{relativeDate(item.note.updatedAt)}</span>
                </button>
              ) : (
                <button
                  key={item.voiceNote.id}
                  className="row"
                  type="button"
                  onClick={() => onOpenVoiceNote(item.voiceNote.id)}
                >
                  <span className="t">
                    <span className="voice-row-icon" style={{ marginRight: 6 }}>
                      <IconMic size={14} />
                    </span>
                    Voice note · {formatDuration(item.voiceNote.durationSeconds)}
                  </span>
                  <span className="m">{relativeDate(item.voiceNote.updatedAt)}</span>
                </button>
              ),
            )}
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
