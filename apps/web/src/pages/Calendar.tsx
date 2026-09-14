import { useEffect, useState } from 'react'
import { listCalendarAccounts, listUpcomingCalendarEvents, type CalendarEvent } from '../lib/calendar'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { dayLabel } from '../lib/format'

interface CalendarProps {
  onOpenConnect?: () => void
}

type Filter = 'all' | 'meetings'

function formatTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (!endIso) return start
  const end = new Date(endIso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${start} – ${end}`
}

// Groups events by day label while preserving the start_at ordering the
// query already returned — no separate sort needed.
function groupByDay(events: CalendarEvent[]): { label: string; events: CalendarEvent[] }[] {
  const groups: { label: string; events: CalendarEvent[] }[] = []
  for (const event of events) {
    const label = dayLabel(event.start_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.events.push(event)
    } else {
      groups.push({ label, events: [event] })
    }
  }
  return groups
}

export default function Calendar({ onOpenConnect }: CalendarProps) {
  const [hasAccounts, setHasAccounts] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [accounts, upcoming] = await Promise.all([listCalendarAccounts(), listUpcomingCalendarEvents()])
      if (cancelled) return
      setHasAccounts(accounts.length > 0)
      setEvents(upcoming)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleEvents = filter === 'meetings' ? events.filter((e) => e.join_url) : events
  const groups = groupByDay(visibleEvents)

  return (
    <div className="page">
      <header className="home-header">
        <h1>Calendar</h1>
        <p className="muted">Your upcoming meeting invites, in one agenda.</p>
      </header>

      {!isSupabaseConfigured && <div className="banner">Connect Supabase first — see apps/web/.env.</div>}

      {isSupabaseConfigured && !loading && !hasAccounts && (
        <div className="empty-state">
          <p>No calendar connected yet.</p>
          <p className="muted">Connect Google Calendar from the Connect tab to see your meetings here.</p>
          {onOpenConnect && (
            <button
              type="button"
              className="link-row"
              onClick={onOpenConnect}
              style={{ justifyContent: 'center', width: '100%', marginTop: 10 }}
            >
              Go to Connect
            </button>
          )}
        </div>
      )}

      {isSupabaseConfigured && !loading && hasAccounts && events.length === 0 && (
        <div className="empty-state">
          <p>No upcoming events.</p>
          <p className="muted">Nothing on your calendar for the next two weeks.</p>
        </div>
      )}

      {isSupabaseConfigured && hasAccounts && events.length > 0 && (
        <>
          <div className="auth-tabs" role="tablist" aria-label="Filter events">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={`auth-tab${filter === 'all' ? ' active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All events
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'meetings'}
              className={`auth-tab${filter === 'meetings' ? ' active' : ''}`}
              onClick={() => setFilter('meetings')}
            >
              Meeting invites only
            </button>
          </div>

          {visibleEvents.length === 0 ? (
            <div className="empty-state">
              <p>No meeting invites.</p>
              <p className="muted">Nothing with a join link in the next two weeks.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} style={{ marginTop: 18 }}>
                <p className="section-label">{group.label}</p>
                <div className="group">
                  {group.events.map((event) => (
                    <div key={event.id} className="row" style={{ cursor: 'default' }}>
                      <span className="t">{event.title || 'Untitled event'}</span>
                      <span className="m">
                        {formatTimeRange(event.start_at, event.end_at)}
                        {event.organizer_name ? ` · ${event.organizer_name}` : ''}
                        {event.location ? ` · ${event.location}` : ''}
                      </span>
                      {event.join_url && (
                        <a
                          className="link-row"
                          href={event.join_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginTop: 4 }}
                        >
                          Join meeting
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
