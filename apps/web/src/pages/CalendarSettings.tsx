import { useEffect, useState } from 'react'
import {
  connectCalendar,
  disconnectCalendar,
  listCalendarAccounts,
  listUpcomingCalendarEvents,
  syncCalendars,
  toggleCalendarSync,
  type CalendarAccount,
  type CalendarEvent,
} from '../lib/calendar'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { relativeDate } from '../lib/format'
import { IconBack, IconGoogle, IconMicrosoft } from '../components/icons'

interface CalendarSettingsProps {
  onBack?: () => void
}

export default function CalendarSettings({ onBack }: CalendarSettingsProps) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [connecting, setConnecting] = useState<CalendarAccount['provider'] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
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

  async function handleToggleSync(account: CalendarAccount) {
    setTogglingId(account.id)
    await toggleCalendarSync(account.id, !account.sync_enabled)
    await reload()
    setTogglingId(null)
  }

  const googleAccount = accounts.find((a) => a.provider === 'google') ?? null

  return (
    <div className="m-screen">
      <div className="m-header">
        {onBack && (
          <button type="button" className="verify-back-btn" onClick={onBack} aria-label="Back">
            <IconBack size={20} />
          </button>
        )}
        <div className="m-heading">
          <h1>Integrations</h1>
          <p className="m-subhead">Connect a calendar so meetings show up automatically</p>
        </div>
      </div>

      {!isSupabaseConfigured && <div className="banner">Connect Supabase first — see apps/web/.env.</div>}

      <div className="m-card m-card-lg">
        <div className="m-list-item" style={{ cursor: 'default' }}>
          <span className="m-list-icon">
            <IconGoogle size={18} />
          </span>
          <span className="m-list-copy">
            <span className="m-list-title">Google Calendar</span>
            <span className="m-list-sub">
              {googleAccount
                ? [
                    googleAccount.provider_email,
                    googleAccount.last_synced_at
                      ? `Synced ${relativeDate(googleAccount.last_synced_at)}`
                      : 'Not synced yet',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Not connected'}
            </span>
          </span>
          <span
            className={
              !googleAccount
                ? 'm-status-pill'
                : googleAccount.sync_enabled
                  ? 'm-status-pill connected'
                  : 'm-status-pill paused'
            }
          >
            {!googleAccount ? 'Off' : googleAccount.sync_enabled ? 'On' : 'Paused'}
          </span>
        </div>

        <div className="m-inline-actions">
          {!googleAccount ? (
            <button
              type="button"
              className="m-small-btn"
              disabled={connecting === 'google' || !isSupabaseConfigured}
              onClick={() => void handleConnect('google')}
            >
              {connecting === 'google' ? 'Redirecting…' : 'Connect'}
            </button>
          ) : (
            <>
              <button type="button" className="m-small-btn" disabled={syncing} onClick={() => void handleSync()}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                className="m-small-btn ghost"
                onClick={() => void handleDisconnect(googleAccount.id)}
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {googleAccount && (
          <>
            <div className="m-divider" />
            <div className="m-list-item" style={{ cursor: 'default' }}>
              <span className="m-list-copy">
                <span className="m-list-title">Sync automatically</span>
                <span className="m-list-sub">
                  {googleAccount.sync_enabled
                    ? 'Included next time you sync'
                    : 'Paused — skipped until you turn this back on'}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={googleAccount.sync_enabled}
                aria-label="Sync automatically"
                className={googleAccount.sync_enabled ? 'm-toggle on' : 'm-toggle'}
                disabled={togglingId === googleAccount.id}
                onClick={() => void handleToggleSync(googleAccount)}
              />
            </div>
          </>
        )}
      </div>

      <div className="m-card m-card-lg">
        <div className="m-list-item" style={{ cursor: 'default' }}>
          <span className="m-list-icon">
            <IconMicrosoft size={18} />
          </span>
          <span className="m-list-copy">
            <span className="m-list-title">Microsoft Teams / Outlook</span>
            <span className="m-list-sub">Needs an Azure AD app registration first</span>
          </span>
          <span className="m-status-pill">Soon</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="m-section-heading">
        <h2>Upcoming</h2>
        <span className="m-section-action" style={{ cursor: 'default' }}>
          Next 14 days
        </span>
      </div>

      {events.length === 0 ? (
        <div className="m-empty">
          <p>No synced events yet.</p>
          <p className="sub">Connect a calendar and tap Sync now.</p>
        </div>
      ) : (
        <div className="m-card m-card-lg">
          {events.slice(0, 8).map((e, i) => (
            <div key={e.id}>
              {i > 0 && <div className="m-divider" style={{ marginBottom: 10 }} />}
              <div className="m-list-item" style={{ cursor: 'default' }}>
                <span className="m-list-copy">
                  <span className="m-list-title">{e.title}</span>
                  <span className="m-list-sub">
                    {new Date(e.start_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </span>
                {e.join_url && (
                  <a className="m-row-pill" href={e.join_url} target="_blank" rel="noreferrer">
                    Join
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
