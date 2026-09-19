import { useEffect, useMemo, useState } from 'react'
import {
  listNotes,
  listVoiceNotes,
  listMeetings,
  type LocalNote,
  type LocalVoiceNote,
  type LocalMeeting,
} from '../lib/db'
import { relativeDate, formatDuration } from '../lib/format'
import { IconDoc, IconMic, IconMeeting, IconPlus, IconSearch } from '../components/icons'

interface NotesProps {
  onOpenNote: (id: string) => void
  onOpenVoiceNote: (id: string) => void
  onOpenMeeting: (id: string) => void
  onNewNote: () => void
}

type Entry =
  | { kind: 'note'; id: string; updatedAt: string; title: string; snippet: string; tags: string[] }
  | { kind: 'voice'; id: string; updatedAt: string; title: string; snippet: string; tags: string[] }
  | { kind: 'meeting'; id: string; updatedAt: string; title: string; snippet: string; tags: string[] }

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'note', label: 'Notes' },
  { id: 'voice', label: 'Voice' },
  { id: 'meeting', label: 'Meetings' },
] as const

export default function Notes({ onOpenNote, onOpenVoiceNote, onOpenMeeting, onNewNote }: NotesProps) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [voiceNotes, setVoiceNotes] = useState<LocalVoiceNote[]>([])
  const [meetings, setMeetings] = useState<LocalMeeting[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    Promise.all([listNotes(), listVoiceNotes(), listMeetings()]).then(([n, v, m]) => {
      if (cancelled) return
      setNotes(n)
      setVoiceNotes(v)
      setMeetings(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // One library across all three capture types, which is what the design's
  // Recent list shows (a note, a transcript and a task list side by side).
  const entries: Entry[] = useMemo(
    () => [
      ...notes.map(
        (n): Entry => ({
          kind: 'note',
          id: n.id,
          updatedAt: n.updatedAt,
          title: n.title || 'Untitled',
          snippet: n.content.trim().slice(0, 140),
          tags: n.tags,
        }),
      ),
      ...voiceNotes.map(
        (v): Entry => ({
          kind: 'voice',
          id: v.id,
          updatedAt: v.updatedAt,
          title: `Voice note · ${formatDuration(v.durationSeconds)}`,
          snippet: (v.transcript ?? '').trim().slice(0, 140),
          tags: [],
        }),
      ),
      ...meetings.map(
        (m): Entry => ({
          kind: 'meeting',
          id: m.id,
          updatedAt: m.updatedAt,
          title: m.title || `Meeting · ${formatDuration(m.durationSeconds)}`,
          snippet: (m.summary ?? m.transcript ?? '').trim().slice(0, 140),
          tags: [],
        }),
      ),
    ],
    [notes, voiceNotes, meetings],
  )

  // Tag chips come from the tags actually in use, most common first — the
  // design's "Pinned / Tasks / Ideas" chips are placeholders for whatever
  // the user's own vocabulary turns out to be.
  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    notes.forEach((n) => n.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)))
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag)
  }, [notes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries
      .filter((e) => {
        if (filter === 'all') return true
        if (filter.startsWith('tag:')) return e.tags.includes(filter.slice(4))
        return e.kind === filter
      })
      .filter((e) => {
        if (!q) return true
        return (
          e.title.toLowerCase().includes(q) ||
          e.snippet.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [entries, query, filter])

  function open(entry: Entry) {
    if (entry.kind === 'note') onOpenNote(entry.id)
    else if (entry.kind === 'voice') onOpenVoiceNote(entry.id)
    else onOpenMeeting(entry.id)
  }

  // The design's two-up cards sit under a "Pinned" heading. Pinning needs a
  // schema change (and a migration Aman has to run by hand), so the same
  // layout carries the two most recent notes instead — no invented state.
  const jumpBackIn = !query && filter === 'all' ? filtered.slice(0, 2) : []
  const listEntries = jumpBackIn.length === 2 ? filtered.slice(2) : filtered

  const countLabel = `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`

  return (
    <div className="m-screen">
      <div className="m-header">
        <div className="m-heading">
          <h1>Notes</h1>
          <p className="m-subhead">{countLabel}</p>
        </div>
        <button type="button" className="m-header-action" onClick={onNewNote}>
          <IconPlus size={14} />
          Create
        </button>
      </div>

      <label className="m-search">
        <IconSearch size={17} />
        <input
          type="search"
          placeholder="Search notes, people, or topics"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search notes"
        />
      </label>

      <div className="m-chips">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? 'm-chip active' : 'm-chip'}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        {topTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={filter === `tag:${tag}` ? 'm-chip active' : 'm-chip'}
            onClick={() => setFilter(`tag:${tag}`)}
          >
            {tag}
          </button>
        ))}
      </div>

      {jumpBackIn.length === 2 && (
        <>
          <div className="m-section-heading">
            <h2>Jump back in</h2>
          </div>
          <div className="m-pin-grid">
            {jumpBackIn.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                className={i === 0 ? 'm-pin-card accent' : 'm-pin-card'}
                onClick={() => open(entry)}
              >
                <p className="m-pin-eyebrow">{entry.tags[0] ?? entry.kind}</p>
                <p className="m-pin-title">{entry.title}</p>
                {entry.snippet && <p className="m-pin-snippet">{entry.snippet}</p>}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="m-section-heading">
        <h2>{jumpBackIn.length === 2 ? 'Recent' : 'All notes'}</h2>
        <span className="m-section-action" style={{ cursor: 'default' }}>
          Sort: Updated
        </span>
      </div>

      {listEntries.length === 0 ? (
        <div className="m-empty">
          <p>{entries.length === 0 ? 'No notes yet.' : 'Nothing matches that.'}</p>
          <p className="sub">
            {entries.length === 0 ? 'Create your first note to get started.' : 'Try a different search or filter.'}
          </p>
        </div>
      ) : (
        <div className="m-card m-card-lg">
          {listEntries.map((entry, i) => (
            <div key={entry.id}>
              {i > 0 && <div className="m-divider" style={{ marginBottom: 10 }} />}
              <button type="button" className="m-list-item" onClick={() => open(entry)}>
                <span className="m-list-icon">
                  {entry.kind === 'note' ? (
                    <IconDoc size={18} />
                  ) : entry.kind === 'voice' ? (
                    <IconMic size={18} />
                  ) : (
                    <IconMeeting size={18} />
                  )}
                </span>
                <span className="m-list-copy">
                  <span className="m-list-title">{entry.title}</span>
                  <span className="m-list-sub">
                    {[relativeDate(entry.updatedAt), ...entry.tags.slice(0, 2).map((t) => `#${t}`)].join(' · ')}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
