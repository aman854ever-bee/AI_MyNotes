import { useEffect, useMemo, useState } from 'react'
import {
  listCalendarAccounts,
  listUpcomingCalendarEvents,
  type CalendarAccount,
  type CalendarEvent,
} from '../lib/calendar'
import { listMeetings, type LocalMeeting } from '../lib/db'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { relativeDate, formatDuration, startOfDay, sameDay, formatTimeRange, groupByDay } from '../lib/format'
import { IconCalendar, IconMeeting, IconLink, IconMic } from '../components/icons'

interface CalendarProps {
  onOpenConnect?: () => void
  onOpenMeeting?: (id: string) => void
  onNewMeeting?: () => void
}

const STRIP_DAYS = 5

export default function Calendar({ onOpenConnect, onOpenMeeting, onNewMeeting }: CalendarProps) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [recorded, setRecorded] = useState<LocalMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [accountList, upcoming, meetings] = await Promise.all([
        listCalendarAccounts().catch(() => [] as CalendarAccount[]),
        listUpcomingCalendarEvents().catch(() => [] as CalendarEvent[]),
        listMeetings(),
      ])
      if (cancelled) return
      setAccounts(accountList)
      setEvents(upcoming)
      setRecorded(meetings)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // The strip runs from today forward, because the calendar data this app
  // holds is upcoming events — showing past days would give empty taps.
  const stripDays = useMemo(() => {
    const today = startOfDay(new Date())
    return Array.from({ length: STRIP_DAYS }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      return d
    })
  }, [])

  const visibleEvents = useMemo(() => {
    const live = events.filter((e) => !e.is_cancelled)
    if (!selectedDay) return live
    return live.filter((e) => sameDay(e.start_at, selectedDay))
  }, [events, selectedDay])

  const groups = groupByDay(visibleEvents)
  const hasAccounts = accounts.length > 0
  const lastSynced = accounts.map((a) => a.last_synced_at).filter(Boolean).sort().reverse()[0]

  const rangeLabel = `${stripDays[0].toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${stripDays[
    STRIP_DAYS - 1
  ].toLocaleDateString(undefined, { day: 'numeric' })}`

  return (
    <div className="m-screen">
      <div className="m-header">
        <div className="m-heading">
          <h1>Meetings</h1>
          <p className="m-subhead">{rangeLabel}</p>
        </div>
        {selectedDay && (
          <button type="button" className="m-header-action" onClick={() => setSelectedDay(null)}>
            All
          </button>
        )}
      </div>

      {!isSupabaseConfigured && <div className="banner">Connect Supabase first — see apps/web/.env.</div>}

      <div className="m-date-strip">
        {stripDays.map((day, i) => {
          const isSelected = selectedDay != null && sameDay(day.toISOString(), selectedDay)
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`m-date${isSelected ? ' active' : ''}${i === 0 ? ' today' : ''}`}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              aria-pressed={isSelected}
            >
              {day.toLocaleDateString(undefined, { weekday: 'narrow' })} {day.getDate()}
            </button>
          )
        })}
      </div>

      {/* The design puts a "15-minute alerts are on" banner here. Scheduled
          reminders don't exist yet, so the same slot carries the thing the
          user actually needs to know about their calendar — whether it's
          connected and how fresh it is. */}
      {isSupabaseConfigured && !loading && (
        <div className="m-note-card">
          <div className="m-list-item" style={{ cursor: hasAccounts ? 'default' : 'pointer' }} onClick={hasAccounts ? undefined : onOpenConnect}>
            <span className="m-list-icon">
              <IconLink size={18} />
            </span>
            <span className="m-list-copy">
              <span className="m-list-title">
                {hasAccounts ? 'Calendar connected' : 'No calendar connected yet'}
              </span>
              <span className="m-list-sub">
                {hasAccounts
                  ? lastSynced
                    ? `Last synced ${relativeDate(lastSynced)}`
                    : 'Waiting for first sync'
                  : 'Connect one in Integrations to see your meetings here'}
              </span>
            </span>
          </div>
        </div>
      )}

      {isSupabaseConfigured && !loading && hasAccounts && visibleEvents.length === 0 && (
        <div className="m-empty">
          <p>{selectedDay ? 'Nothing that day.' : 'No upcoming events.'}</p>
          <p className="sub">
            {selectedDay ? 'Pick another day or show everything.' : 'Nothing on your calendar for the next two weeks.'}
          </p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label} style={{ display: 'contents' }}>
          <div className="m-section-heading">
            <h2>{group.label}</h2>
          </div>
          <div className="m-card m-card-lg">
            {group.events.map((event, i) => (
              <div key={event.id}>
                {i > 0 && <div className="m-divider" style={{ marginBottom: 10 }} />}
                <div className="m-list-item" style={{ cursor: 'default' }}>
                  <span className="m-list-icon">
                    {event.join_url ? <IconMeeting size={18} /> : <IconCalendar size={18} />}
                  </span>
                  <span className="m-list-copy">
                    <span className="m-list-title">{event.title || 'Untitled event'}</span>
                    <span className="m-list-sub">
                      {[formatTimeRange(event.start_at, event.end_at), event.location, event.organizer_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {event.join_url && (
                    <a className="m-row-pill" href={event.join_url} target="_blank" rel="noreferrer">
                      Join
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Recorded meetings live on the Meetings tab too — the design's flow
          runs from this screen through recording, transcript and follow-up,
          so past recordings belong alongside what's coming up. */}
      {recorded.length > 0 && (
        <>
          <div className="m-section-heading">
            <h2>Recorded</h2>
            {onNewMeeting && (
              <button type="button" className="m-section-action" onClick={onNewMeeting}>
                Record
              </button>
            )}
          </div>
          <div className="m-card m-card-lg">
            {recorded.slice(0, 6).map((meeting, i) => (
              <div key={meeting.id}>
                {i > 0 && <div className="m-divider" style={{ marginBottom: 10 }} />}
                <button type="button" className="m-list-item" onClick={() => onOpenMeeting?.(meeting.id)}>
                  <span className="m-list-icon">
                    <IconMic size={18} />
                  </span>
                  <span className="m-list-copy">
                    <span className="m-list-title">
                      {meeting.title || `Meeting · ${formatDuration(meeting.durationSeconds)}`}
                    </span>
                    <span className="m-list-sub">
                      {[relativeDate(meeting.updatedAt), meeting.summary ? 'Summarized' : meeting.transcript ? 'Transcribed' : 'Not transcribed']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !hasAccounts && recorded.length === 0 && (
        <div className="m-empty">
          <p>Nothing here yet.</p>
          <p className="sub">Connect a calendar or record a meeting to get started.</p>
        </div>
      )}
    </div>
  )
}
