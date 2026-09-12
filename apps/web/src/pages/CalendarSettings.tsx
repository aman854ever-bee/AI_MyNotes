import { useEffect, useState } from 'react'
import {
  connectCalendar,
  disconnectCalendar,
  listCalendarAccounts,
  listUpcomingCalendarEvents,
  syncCalendars,
  type CalendarAccount,
  type CalendarEvent,
} from '../lib/calendar'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { IconBack } from '../components/icons'

interface CalendarSettingsProps {
  onBack: () => void
}

const PROVIDER_LABEL: Record<CalendarAccount['provider'], string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft Teams / Outlook',
}

export default function CalendarSettings({ onBack }: CalendarSettingsProps) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [connecting, setConnecting] = useState<CalendarAccount['provider'] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const [a, e] = await Promise.all([listCalendarAccounts(), listUpcomingCalendarEvents()])
    setAccounts(a)
    setEvents(e)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleConnect(provider: CalendarAccount['provider']) {
    setError(null)
    setConnecting(provider)
    const result = await connectCalendar(provider)
    // On success the browser navigates away to the provider before this
    // resolves — reaching this line at all usually means it failed.
    if (!result.ok) {
      setError(result.message)
      setConnecting(null)
    }
  }

  async function handleDisconnect(accountId: string) {
    await disconnectCalendar(accountId)
    await reload()
  }

  async function handleSync() {
    setSyncing(true)
    setError(null)
    const result = await syncCalendars()
    setSyncing(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    await reload()
  }

  const googleConnected = accounts.some((a) => a.provider === 'google')

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
          <IconBack />
        </button>
      </div>

      <h1 className="title-input" style={{ pointerEvents: 'none' }}>
        Connected calendars
      </h1>
      <p className="muted">
        Connect a calendar so meeting invites show up in MyNotes automatically, with reminders before each one
        starts.
      </p>

      {!isSupabaseConfigured && <div className="banner">Connect Supabase first — see apps/web/.env.</div>}

      <div>
        <p className="section-label">Providers</p>
        <div className="group">
          <div className="row" style={{ cursor: 'default' }}>
            <span className="t">Google Calendar / Google Meet</span>
            <span className="m">
              {googleConnected
                ? `Connected${accounts.find((a) => a.provider === 'google')?.provider_email ? ` · ${accounts.find((a) => a.provider === 'google')?.provider_email}` : ''}`
                : 'Not connected'}
            </span>
          </div>
          <div className="row" style={{ cursor: 'default' }}>
            <span className="t">Microsoft Teams / Outlook</span>
            <span className="m">Coming soon</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {!googleConnected && (
            <button
              className="analyze-btn"
              type="button"
              style={{ width: 'auto', padding: '10px 16px' }}
              disabled={connecting === 'google' || !isSupabaseConfigured}
              onClick={() => void handleConnect('google')}
            >
              {connecting === 'google' ? 'Redirecting…' : 'Connect Google Calendar'}
            </button>
          )}
          {googleConnected && (
            <>
              <button
                className="analyze-btn"
                type="button"
                style={{ width: 'auto', padding: '10px 16px' }}
                disabled={syncing}
                onClick={() => void handleSync()}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                className="suggestion-ignore"
                type="button"
                onClick={() => void handleDisconnect(accounts.find((a) => a.provider === 'google')!.id)}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
        {error && <p className="muted" style={{ marginTop: 8 }}>{error}</p>}
      </div>

      <div>
        <p className="section-label">Upcoming (next 14 days)</p>
        {events.length === 0 ? (
          <div className="empty-state">
            <p>No synced events yet.</p>
            <p className="muted">Connect a calendar and tap "Sync now".</p>
          </div>
        ) : (
          <div className="group">
            {events.map((e) => (
              <div key={e.id} className="row" style={{ cursor: 'default' }}>
                <span className="t">{e.title}</span>
                <span className="m">
                  {new Date(e.start_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  {e.join_url ? ' · has a join link' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
