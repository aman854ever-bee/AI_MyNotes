import { useCallback, useEffect, useState } from 'react'
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
import { checkConnectedAccount, validateProviderSetup } from '../lib/calendarSetup'
import { requirementsFor, type CalendarProviderId, type CheckResult } from '../lib/calendarRequirements'
import CalendarProviderCard from '../components/CalendarProviderCard'
import { IconBack } from '../components/icons'

interface CalendarSettingsProps {
  onBack?: () => void
}

const PROVIDERS: CalendarProviderId[] = ['google', 'microsoft']

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''

export default function CalendarSettings({ onBack }: CalendarSettingsProps) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [checks, setChecks] = useState<Record<CalendarProviderId, CheckResult[] | null>>({
    google: null,
    microsoft: null,
  })
  const [checking, setChecking] = useState<CalendarProviderId | null>(null)
  const [connecting, setConnecting] = useState<CalendarProviderId | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [a, e] = await Promise.all([listCalendarAccounts(), listUpcomingCalendarEvents()])
    setAccounts(a)
    setEvents(e)
    return a
  }, [])

  /**
   * Runs the real preflight for one provider.
   *
   * For an account that's already connected, the token health check is
   * appended — "connected" and "actually able to sync" are different
   * things, and the difference is otherwise invisible until events
   * silently stop arriving.
   */
  const runChecks = useCallback(async (provider: CalendarProviderId, connected: boolean) => {
    setChecking(provider)
    const results = await validateProviderSetup(provider)
    if (connected) results.push(await checkConnectedAccount(provider))
    setChecks((prev) => ({ ...prev, [provider]: results }))
    setChecking(null)
  }, [])

  useEffect(() => {
    void (async () => {
      const loaded = await reload()
      // Sequential rather than parallel: each provider's check invokes the
      // calendar-sync readiness probe, and firing both at once just to
      // render a card a moment sooner isn't worth doubling the load.
      for (const provider of PROVIDERS) {
        await runChecks(provider, loaded.some((a) => a.provider === provider))
      }
    })()
  }, [reload, runChecks])

  async function handleConnect(provider: CalendarProviderId) {
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

  async function handleDisconnect(provider: CalendarProviderId, accountId: string) {
    await disconnectCalendar(accountId)
    await reload()
    await runChecks(provider, false)
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
    if (result.synced === 0) {
      // Not an error, but worth saying — a silent no-op here is exactly
      // what a broken-but-connected account looks like.
      setError('Sync ran but returned no events. If you expected some, re-check the setup below.')
    }
    await reload()
  }

  async function handleToggleSync(account: CalendarAccount) {
    setTogglingId(account.id)
    await toggleCalendarSync(account.id, !account.sync_enabled)
    await reload()
    setTogglingId(null)
  }

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

      {PROVIDERS.map((provider) => {
        const account = accounts.find((a) => a.provider === provider) ?? null
        return (
          <CalendarProviderCard
            key={provider}
            requirements={requirementsFor(provider, SUPABASE_URL)}
            account={account}
            checks={checks[provider]}
            checking={checking === provider}
            connecting={connecting === provider}
            syncing={syncing}
            toggling={account ? togglingId === account.id : false}
            onRecheck={() => void runChecks(provider, Boolean(account))}
            onConnect={() => void handleConnect(provider)}
            onDisconnect={() => account && void handleDisconnect(provider, account.id)}
            onSync={() => void handleSync()}
            onToggleSync={() => account && void handleToggleSync(account)}
          />
        )
      })}

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
