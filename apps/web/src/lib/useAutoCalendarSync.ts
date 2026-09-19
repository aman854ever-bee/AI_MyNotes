import { useCallback, useEffect, useRef, useState } from 'react'
import { listCalendarAccounts, syncCalendars } from './calendar'
import { loadSyncPreferences } from './calendarPreferences'
import {
  DEFAULT_SYNC_PREFERENCES,
  describeSkipReason,
  msUntilNextSync,
  shouldAutoSync,
  type SyncPreferences,
} from './syncSchedule'

// Makes calendar sync actually automatic.
//
// Until this existed, `syncCalendars()` only ever ran when someone pressed
// "Sync now" — so an app whose whole premise is "meetings show up
// automatically" showed nothing until you went looking for a button. This
// hook runs a sync when the app opens and then on the user's chosen
// interval, with the decision itself delegated to lib/syncSchedule.ts
// (pure, tested), because the two ways to get it wrong — hammering the
// provider, or never syncing — are both easy and both quiet.
//
// Scope, deliberately: this syncs while the app is open. It is not a
// background job; nothing runs when the app is closed. Doing that properly
// needs a scheduled server-side invocation (pg_cron or a Supabase
// scheduled function), which is separate work and real infrastructure —
// see ADR 0016.

const LAST_ATTEMPT_KEY = 'mynotes:lastCalendarSyncAttempt'

/** Survives reloads so a refresh loop can't bypass the retry guard.
 *  localStorage can throw (private mode, blocked storage), so every access
 *  is guarded — a failure here must not stop syncing. */
function readLastAttempt(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_ATTEMPT_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeLastAttempt(at: number): void {
  try {
    window.localStorage.setItem(LAST_ATTEMPT_KEY, String(at))
  } catch {
    // Ignored on purpose: without persistence the in-memory ref still
    // guards this session, which is the common case.
  }
}

export interface AutoSyncState {
  prefs: SyncPreferences
  syncing: boolean
  lastSyncedAt: number | null
  /** Why the last automatic check decided not to sync, in plain words. */
  idleReason: string | null
  error: string | null
  /** Forces a sync now, ignoring the schedule (the "Sync now" button). */
  syncNow: () => Promise<void>
  /** Re-reads preferences after they've been changed elsewhere. */
  refreshPreferences: () => Promise<void>
}

export function useAutoCalendarSync(enabled: boolean): AutoSyncState {
  const [prefs, setPrefs] = useState<SyncPreferences>(DEFAULT_SYNC_PREFERENCES)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [idleReason, setIdleReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lastAttemptRef = useRef<number | null>(readLastAttempt())
  const timerRef = useRef<number | null>(null)
  const unmountedRef = useRef(false)
  // Guards against two syncs overlapping — the interval timer firing while
  // a manual sync is still in flight would double the provider calls.
  const inFlightRef = useRef(false)

  const runSync = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const attemptAt = Date.now()
    lastAttemptRef.current = attemptAt
    writeLastAttempt(attemptAt)

    setSyncing(true)
    setError(null)
    const result = await syncCalendars()
    if (unmountedRef.current) {
      inFlightRef.current = false
      return
    }
    setSyncing(false)
    inFlightRef.current = false

    if (!result.ok) {
      setError(result.message)
      return
    }
    setLastSyncedAt(Date.now())
    setIdleReason(null)
  }, [])

  const refreshPreferences = useCallback(async () => {
    const loaded = await loadSyncPreferences()
    if (!unmountedRef.current) setPrefs(loaded)
  }, [])

  useEffect(() => {
    unmountedRef.current = false
    if (!enabled) return

    function clearTimer() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    /**
     * Evaluates the schedule and either syncs or sets a timer for when the
     * next check is due. Re-arms itself rather than using setInterval, so
     * a long-running sync can't queue up overlapping ticks.
     */
    async function tick(): Promise<void> {
      if (unmountedRef.current) return

      const [loadedPrefs, accounts] = await Promise.all([loadSyncPreferences(), listCalendarAccounts()])
      if (unmountedRef.current) return
      setPrefs(loadedPrefs)

      const hasSyncableAccount = accounts.some((a) => a.sync_enabled)
      // The server's own record of the last sync is authoritative —
      // another device may have synced since this one last did.
      const serverLastSynced = accounts
        .map((a) => (a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0))
        .reduce((max, t) => Math.max(max, t), 0)
      const effectiveLastSynced = serverLastSynced > 0 ? serverLastSynced : null
      if (effectiveLastSynced !== null) setLastSyncedAt(effectiveLastSynced)

      const decision = shouldAutoSync({
        prefs: loadedPrefs,
        lastSyncedAt: effectiveLastSynced,
        lastAttemptAt: lastAttemptRef.current,
        hasSyncableAccount,
        now: Date.now(),
      })

      if (decision.shouldSync) {
        setIdleReason(null)
        await runSync()
      } else {
        setIdleReason(describeSkipReason(decision.reason))
      }

      if (unmountedRef.current) return
      clearTimer()
      const wait = msUntilNextSync({
        prefs: loadedPrefs,
        lastSyncedAt: effectiveLastSynced,
        lastAttemptAt: lastAttemptRef.current,
        now: Date.now(),
      })
      timerRef.current = window.setTimeout(() => void tick(), wait)
    }

    void tick()

    // Coming back to a backgrounded tab is exactly when stale events are
    // most visible, and timers are throttled or suspended while hidden.
    function onVisible() {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      unmountedRef.current = true
      clearTimer()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, runSync])

  const syncNow = useCallback(async () => {
    // Manual sync deliberately bypasses the schedule — the user asked.
    await runSync()
  }, [runSync])

  return { prefs, syncing, lastSyncedAt, idleReason, error, syncNow, refreshPreferences }
}
