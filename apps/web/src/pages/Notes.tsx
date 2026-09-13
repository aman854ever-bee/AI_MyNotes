import { useEffect, useMemo, useState } from 'react'
import { listNotes, type LocalNote } from '../lib/db'
import { relativeDate } from '../lib/format'
import { IconBack, IconPlus, IconSearch } from '../components/icons'

interface NotesProps {
  onBack?: () => void
  onOpenNote: (id: string) => void
  onCapture: () => void
}

export default function Notes({ onBack, onOpenNote, onCapture }: NotesProps) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    listNotes().then((n) => {
      if (!cancelled) setNotes(n)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((n) => {
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [notes, query])

  function snippet(content: string): string {
    return content.trim().slice(0, 140)
  }

  return (
    <div className="page">
      <div className="topbar">
        {onBack ? (
          <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
            <IconBack />
          </button>
        ) : (
          <span style={{ width: 38 }} />
        )}
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 20 }}>Notes</span>
        <span style={{ width: 38 }} />
      </div>

      <label className="search">
        <IconSearch />
        <input
          type="text"
          placeholder="Search your work memory…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {filtered.length === 0 && (
        <div className="empty-state">
          <p>{notes.length === 0 ? 'No notes yet.' : 'No notes match your search.'}</p>
          {notes.length === 0 && <p className="muted">Tap Capture to write your first one.</p>}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="list">
          {filtered.map((note) => (
            <button key={note.id} className="card" type="button" onClick={() => onOpenNote(note.id)}>
              <div className="top">
                <span className="t">{note.title || 'Untitled'}</span>
                <span className="date">{relativeDate(note.updatedAt)}</span>
              </div>
              {note.content && <p className="snippet">{snippet(note.content)}</p>}
              {note.tags.length > 0 && (
                <div className="tags">
                  {note.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <button className="capture-btn" type="button" onClick={onCapture}>
        <IconPlus />
        Capture
      </button>
    </div>
  )
}
