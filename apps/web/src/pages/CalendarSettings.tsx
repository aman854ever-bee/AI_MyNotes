import { useCallback, useEffect, useRef, useState } from 'react'
import {
  connectCalendar,
  disconnectCalendar,
  listCalendarAccounts,
  listUpcomingCalendarEvents,
  toggleCalendarSync,
  type CalendarAccount,
  type CalendarEvent,
} from '../lib/calendar'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { checkConnectedAccount, validateProviderSetup } from '../lib/calendarSetup'
import { requirementsFor, type CalendarProviderId, type CheckResult } from '../lib/calendarRequirements'
import { saveSyncPreferences } from '../lib/calendarPreferences'
import { useAutoCalendarSync } from '../lib/useAutoCalendarSync'
import type { SyncPreferences } from '../lib/syncSchedule'
import CalendarProviderCard from '../components/CalendarProviderCard'
import CalendarSyncSettings from '../components/CalendarSyncSettings'
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
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drives automatic syncing as well as the manual button — this is what
  // makes events appear without anyone pressing anything.
  const autoSync = useAutoCalendarSync(isSupabaseConfigured)

  // Kept in a ref so `reload` doesn't need the window in its dependency
  // list — otherwise every preference change would re-create it and
  // re-trigger the setup checks, which invoke the readiness probe.
  const windowDaysRef = useRef(autoSync.prefs.syncWindowDays)
  windowDaysRef.current = autoSync.prefs.syncWindowDays

  const reload = useCallback(async () => {
    const [a, e] = await Promise.all([
      listCalendarAccounts(),
      // Read back the same window that was synced, rather than the old
      // hardcoded 14 days — otherwise a 30-day window would sync 30 days
      // of events and then display only 14 of them.
      listUpcomingCalendarEvents(windowDaysRef.current),
    ])
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
    setError(null)
    await autoSync.syncNow()
    await reload()
  }

  async function handleToggleSync(account: CalendarAccount) {
    setTogglingId(account.id)
    await toggleCalendarSync(account.id, !account.sync_enabled)
    await reload()
    setTogglingId(null)
  }

  async function handleSavePrefs(next: SyncPreferences) {
    setSavingPrefs(true)
    setError(null)
    const result = await saveSyncPreferences(next)
    setSavingPrefs(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    // Re-read rather than trusting local state: the saved values may have
    // been clamped on the way in.
    await autoSync.refreshPreferences()
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
            syncing={autoSync.syncing}
            toggling={account ? togglingId === account.id : false}
            onRecheck={() => void runChecks(provider, Boolean(account))}
            onConnect={() => void handleConnect(provider)}
            onDisconnect={() => account && void handleDisconnect(provider, account.id)}
            onSync={() => void handleSync()}
            onToggleSync={() => account && void handleToggleSync(account)}
          />
        )
      })}

      <CalendarSyncSettings
        prefs={autoSync.prefs}
        hasAccount={accounts.length > 0}
        lastSyncedAt={autoSync.lastSyncedAt}
        idleReason={autoSync.idleReason}
        saving={savingPrefs}
        onSave={(next) => void handleSavePrefs(next)}
      />

      {(error || autoSync.error) && <p className="error">{error ?? autoSync.error}</p>}

      <div className="m-section-heading">
        <h2>Upcoming</h2>
        <span className="m-section-action" style={{ cursor: 'default' }}>
          {/* Follows the configured window — a fixed "Next 14 days" here
              would start lying the moment someone changed it. */}
          Next {autoSync.prefs.syncWindowDays} days
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
