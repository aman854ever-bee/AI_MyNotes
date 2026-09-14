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
    <div className="page">
      {onBack && (
        <div className="topbar">
          <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
            <IconBack />
          </button>
        </div>
      )}

      <h1 className="title-input" style={{ pointerEvents: 'none' }}>
        Connect
      </h1>
      <p className="muted">
        Connect a calendar so meeting invites show up in MyNotes automatically, with reminders before each one
        starts.
      </p>

      {!isSupabaseConfigured && <div className="banner">Connect Supabase first — see apps/web/.env.</div>}

      <div>
        <p className="section-label">Providers</p>

        <div className="provider-card">
          <div className="provider-card-head">
            <span className="provider-icon">
              <IconGoogle size={20} />
            </span>
            <div className="provider-info">
              <div className="provider-name">Google Calendar / Google Meet</div>
              <div className="provider-detail">
                {googleAccount
                  ? [
                      googleAccount.provider_email,
                      googleAccount.last_synced_at
                        ? `Last synced ${relativeDate(googleAccount.last_synced_at)}`
                        : 'Not synced yet',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Not connected'}
              </div>
            </div>
            <span
              className={
                !googleAccount
                  ? 'status-pill not-connected'
                  : googleAccount.sync_enabled
                    ? 'status-pill connected'
                    : 'status-pill paused'
              }
            >
              {!googleAccount ? 'Not connected' : googleAccount.sync_enabled ? 'Connected' : 'Paused'}
            </span>
          </div>

          <div className="provider-card-actions">
            {!googleAccount && (
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
            {googleAccount && (
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
                <button className="suggestion-ignore" type="button" onClick={() => void handleDisconnect(googleAccount.id)}>
                  Disconnect
                </button>
              </>
            )}
          </div>

          {googleAccount && (
            <div className="sync-toggle-row">
              <div>
                <div className="sync-toggle-label">Sync automatically</div>
                <div className="sync-toggle-sub">
                  {googleAccount.sync_enabled
                    ? 'Included next time you tap "Sync now".'
                    : 'Paused — skipped until you turn this back on.'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={googleAccount.sync_enabled}
                aria-label="Sync automatically"
                className={googleAccount.sync_enabled ? 'sync-toggle on' : 'sync-toggle'}
                disabled={togglingId === googleAccount.id}
                onClick={() => void handleToggleSync(googleAccount)}
              />
            </div>
          )}
        </div>

        <div className="provider-card">
          <div className="provider-card-head">
            <span className="provider-icon">
              <IconMicrosoft size={20} />
            </span>
            <div className="provider-info">
              <div className="provider-name">Microsoft Teams / Outlook</div>
              <div className="provider-detail">Needs an Azure AD app registration first (piece 6).</div>
            </div>
            <span className="status-pill coming-soon">Coming soon</span>
          </div>
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
