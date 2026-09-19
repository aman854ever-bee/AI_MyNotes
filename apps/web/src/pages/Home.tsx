import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  listNotes,
  listVoiceNotes,
  listMeetings,
  listOpenActionItems,
  type LocalNote,
  type LocalVoiceNote,
  type LocalMeeting,
  type LocalActionItem,
} from '../lib/db'
import { listUpcomingCalendarEvents, type CalendarEvent } from '../lib/calendar'
import { relativeDate, formatDuration } from '../lib/format'
import { IconDoc, IconMeeting, IconMic, IconPlus, IconUsers } from '../components/icons'

interface HomeProps {
  userName: string
  onOpenNote: (id: string) => void
  onOpenVoiceNote: (id: string) => void
  onOpenMeeting: (id: string) => void
  onOpenNotesList: () => void
  onOpenMeetingsList: () => void
  onNewNote: () => void
  onNewVoiceNote: () => void
  onNewMeeting: () => void
}

type RecentItem =
  | { kind: 'note'; updatedAt: string; note: LocalNote }
  | { kind: 'voice'; updatedAt: string; voiceNote: LocalVoiceNote }
  | { kind: 'meeting'; updatedAt: string; meeting: LocalMeeting }

/** "IN 28 MIN" / "IN 2 HR" / "NOW" — the pill on the next-meeting card. */
function untilLabel(startIso: string): string {
  const minutes = Math.round((new Date(startIso).getTime() - Date.now()) / 60000)
  if (minutes <= 0) return 'NOW'
  if (minutes < 60) return `IN ${minutes} MIN`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `IN ${hours} HR`
  return `IN ${Math.round(hours / 24)} D`
}

function timeRange(event: CalendarEvent): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  const start = new Date(event.start_at).toLocaleTimeString([], opts)
  if (!event.end_at) return start
  return `${start}–${new Date(event.end_at).toLocaleTimeString([], opts)}`
}

export default function Home({
  userName,
  onOpenNote,
  onOpenVoiceNote,
  onOpenMeeting,
  onOpenNotesList,
  onOpenMeetingsList,
  onNewNote,
  onNewVoiceNote,
  onNewMeeting,
}: HomeProps) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [voiceNotes, setVoiceNotes] = useState<LocalVoiceNote[]>([])
  const [meetings, setMeetings] = useState<LocalMeeting[]>([])
  const [actionItems, setActionItems] = useState<LocalActionItem[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listNotes(), listVoiceNotes(), listMeetings(), listOpenActionItems()]).then(
      ([n, v, m, a]) => {
        if (cancelled) return
        setNotes(n)
        setVoiceNotes(v)
        setMeetings(m)
        setActionItems(a)
        setLoaded(true)
      },
    )
    // Calendar events are remote-only and may fail (not connected, offline) —
    // that's an empty agenda, not a broken dashboard, so it's handled apart
    // from the local reads above and never blocks them.
    listUpcomingCalendarEvents(1)
      .then((e) => {
        if (!cancelled) setEvents(e)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  const recentItems: RecentItem[] = [
    ...notes.map((note): RecentItem => ({ kind: 'note', updatedAt: note.updatedAt, note })),
    ...voiceNotes.map((voiceNote): RecentItem => ({ kind: 'voice', updatedAt: voiceNote.updatedAt, voiceNote })),
    ...meetings.map((meeting): RecentItem => ({ kind: 'meeting', updatedAt: meeting.updatedAt, meeting })),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const recent = recentItems.slice(0, 3)

  const upcoming = events.filter((e) => !e.is_cancelled && new Date(e.end_at ?? e.start_at) > new Date())
  const nextMeeting = upcoming[0]

  // "Today's brief" — the design's slot for a five-item digest. Figma fills
  // it with sample news headlines; MyNotes has no news source and inventing
  // one would be filler, so the same slot carries the user's actual day:
  // today's remaining meetings first, then whatever is still outstanding.
  const briefEvents = upcoming.slice(nextMeeting ? 1 : 0, 3)
  const brief: { id: string; title: string; sub: string; onOpen?: () => void }[] = [
    ...briefEvents.map((e) => ({
      id: `event-${e.id}`,
      title: e.title,
      sub: `${timeRange(e)} · ${e.organizer_name ?? 'Meeting'}`,
      onOpen: onOpenMeetingsList,
    })),
    ...actionItems.map((item) => ({
      id: `action-${item.id}`,
      title: item.title,
      sub: item.dueDate ? `Due ${relativeDate(item.dueDate)}` : 'No due date',
      onOpen: item.sourceMeetingId ? () => onOpenMeeting(item.sourceMeetingId as string) : undefined,
    })),
  ].slice(0, 5)

  return (
    <div className="m-screen">
      {!isSupabaseConfigured && (
        <div className="banner">
          Connect Supabase to sync across devices — add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>apps/web/.env</code>. Notes save locally either way.
        </div>
      )}

      <div className="m-header">
        <div className="m-heading">
          <h1>
            {greeting}
            {userName ? `, ${userName}` : ''}
          </h1>
          <p className="m-subhead">{today}</p>
        </div>
      </div>

      <div className="m-quick-actions">
        <button type="button" className="m-quick-action" onClick={onNewNote}>
          <IconPlus size={19} />
          <span className="l">New note</span>
        </button>
        <button type="button" className="m-quick-action" onClick={onNewVoiceNote}>
          <IconMic size={19} />
          <span className="l">Voice note</span>
        </button>
        <button type="button" className="m-quick-action" onClick={onNewMeeting}>
          <IconUsers size={19} />
          <span className="l">Meeting</span>
        </button>
      </div>

      {nextMeeting && (
        <div className="m-meeting-card">
          <div className="m-meeting-status">
            <span className="m-meeting-pill">{untilLabel(nextMeeting.start_at)}</span>
          </div>
          <p className="m-meeting-title">{nextMeeting.title}</p>
          <p className="m-meeting-meta">
            {[timeRange(nextMeeting), nextMeeting.location, nextMeeting.organizer_name]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {nextMeeting.join_url ? (
            <a
              className="m-primary-btn"
              href={nextMeeting.join_url}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              Join meeting
            </a>
          ) : (
            <button type="button" className="m-primary-btn" onClick={onOpenMeetingsList}>
              View meeting
            </button>
          )}
        </div>
      )}

      <div className="m-section-heading">
        <h2>Recent notes</h2>
        <button type="button" className="m-section-action" onClick={onOpenNotesList}>
          See all
        </button>
      </div>

      {loaded && recent.length === 0 ? (
        <div className="m-empty">
          <p>Nothing here yet.</p>
          <p className="sub">Capture your first note to get started.</p>
        </div>
      ) : (
        recent.length > 0 && (
          <div className="m-card">
            {recent.map((item, i) => (
              <div key={item.kind === 'note' ? item.note.id : item.kind === 'voice' ? item.voiceNote.id : item.meeting.id}>
                {i > 0 && <div className="m-divider" style={{ marginBottom: 10 }} />}
                {item.kind === 'note' ? (
                  <button type="button" className="m-list-item" onClick={() => onOpenNote(item.note.id)}>
                    <span className="m-list-icon">
                      <IconDoc size={18} />
                    </span>
                    <span className="m-list-copy">
                      <span className="m-list-title">{item.note.title || 'Untitled'}</span>
                      <span className="m-list-sub">Edited {relativeDate(item.note.updatedAt)}</span>
                    </span>
                  </button>
                ) : item.kind === 'voice' ? (
                  <button type="button" className="m-list-item" onClick={() => onOpenVoiceNote(item.voiceNote.id)}>
                    <span className="m-list-icon">
                      <IconMic size={18} />
                    </span>
                    <span className="m-list-copy">
                      <span className="m-list-title">Voice note · {formatDuration(item.voiceNote.durationSeconds)}</span>
                      <span className="m-list-sub">Edited {relativeDate(item.voiceNote.updatedAt)}</span>
                    </span>
                  </button>
                ) : (
                  <button type="button" className="m-list-item" onClick={() => onOpenMeeting(item.meeting.id)}>
                    <span className="m-list-icon">
                      <IconMeeting size={18} />
                    </span>
                    <span className="m-list-copy">
                      <span className="m-list-title">
                        {item.meeting.title || `Meeting · ${formatDuration(item.meeting.durationSeconds)}`}
                      </span>
                      <span className="m-list-sub">Edited {relativeDate(item.meeting.updatedAt)}</span>
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {brief.length > 0 && (
        <>
          <div className="m-section-heading">
            <h2>Today's brief</h2>
            <span className="m-section-action" style={{ cursor: 'default' }}>
              Top {brief.length}
            </span>
          </div>
          <div className="m-feed">
            {brief.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="m-feed-item"
                onClick={entry.onOpen}
                disabled={!entry.onOpen}
              >
                <span className="m-list-copy">
                  <span className="m-list-title">{entry.title}</span>
                  <span className="m-list-sub">{entry.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {loaded && recent.length > 0 && brief.length === 0 && (
        <>
          <div className="m-section-heading">
            <h2>Today's brief</h2>
          </div>
          <div className="m-empty">
            <p>Your day is clear.</p>
            <p className="sub">
              {events.length === 0
                ? 'Connect a calendar to see meetings here.'
                : 'No meetings left today and nothing outstanding.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
