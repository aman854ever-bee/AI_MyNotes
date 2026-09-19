// When automatic calendar sync should actually fire.
//
// Pure and zero-dependency (same reasoning as lib/format.ts and
// lib/micGuidance.ts — see docs/testing.md), because the cost of getting
// this wrong is not a visual glitch: too eager and every app open burns
// provider API quota and Edge Function invocations, too lazy and the
// app's central promise ("meetings show up automatically") quietly isn't
// true. Both failure modes are easy to introduce and hard to notice, so
// the rules live somewhere they can be tested directly.

export interface SyncPreferences {
  autoSync: boolean
  syncIntervalMinutes: number
  syncWindowDays: number
}

/** Matches the column defaults in migration 0007, and what the app falls
 *  back to when no preferences row exists yet. */
export const DEFAULT_SYNC_PREFERENCES: SyncPreferences = {
  autoSync: true,
  syncIntervalMinutes: 30,
  syncWindowDays: 14,
}

export const MIN_SYNC_INTERVAL_MINUTES = 5
export const MAX_SYNC_INTERVAL_MINUTES = 1440
export const MIN_SYNC_WINDOW_DAYS = 1
export const MAX_SYNC_WINDOW_DAYS = 60

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  // Absent-or-junk has to be rejected *before* Number(), not after:
  // Number(null), Number([]) and Number('') are all 0, which is finite, so
  // a naive check would clamp them to `min` rather than falling back. For
  // an interval that means silently syncing at the fastest allowed rate
  // instead of the intended default — the exact cost this clamp exists to
  // prevent. Caught by a test, not by inspection.
  if (value === null || value === undefined) return fallback
  if (typeof value === 'boolean') return fallback
  if (typeof value === 'object') return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback

  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Coerces whatever came back from the database (or a stale client) into
 * something safe to act on.
 *
 * The DB has CHECK constraints, but this runs on values that may predate
 * them, come from an older client, or arrive as strings from a form — and
 * an out-of-range interval here would mean a sync loop, so it's clamped
 * rather than trusted.
 */
export function normalizeSyncPreferences(raw: Partial<Record<keyof SyncPreferences, unknown>> | null): SyncPreferences {
  if (!raw) return { ...DEFAULT_SYNC_PREFERENCES }
  return {
    autoSync: typeof raw.autoSync === 'boolean' ? raw.autoSync : DEFAULT_SYNC_PREFERENCES.autoSync,
    syncIntervalMinutes: clampInt(
      raw.syncIntervalMinutes,
      MIN_SYNC_INTERVAL_MINUTES,
      MAX_SYNC_INTERVAL_MINUTES,
      DEFAULT_SYNC_PREFERENCES.syncIntervalMinutes,
    ),
    syncWindowDays: clampInt(
      raw.syncWindowDays,
      MIN_SYNC_WINDOW_DAYS,
      MAX_SYNC_WINDOW_DAYS,
      DEFAULT_SYNC_PREFERENCES.syncWindowDays,
    ),
  }
}

export interface SyncDecisionInput {
  prefs: SyncPreferences
  /** Most recent successful sync across all connected accounts, ms epoch. */
  lastSyncedAt: number | null
  /** Most recent *attempt*, successful or not, ms epoch. Prevents a
   *  failing sync from retrying in a tight loop. */
  lastAttemptAt: number | null
  /** Whether any account is connected and not paused. */
  hasSyncableAccount: boolean
  now: number
}

export type SyncSkipReason =
  | 'auto-sync-off'
  | 'no-syncable-account'
  | 'interval-not-elapsed'
  | 'attempt-too-recent'

export type SyncDecision = { shouldSync: true } | { shouldSync: false; reason: SyncSkipReason }

/**
 * How long to wait after any attempt before trying again, regardless of
 * the user's interval. Without this, a provider outage turns every mount
 * into another failed round-trip.
 */
export const MIN_RETRY_GAP_MS = 60_000

/**
 * Decides whether to kick off an automatic sync right now.
 *
 * Deliberately returns a reason when it says no — the Connect screen shows
 * it, so "why hasn't this synced?" is answerable without reading logs.
 */
export function shouldAutoSync(input: SyncDecisionInput): SyncDecision {
  const { prefs, lastSyncedAt, lastAttemptAt, hasSyncableAccount, now } = input

  if (!prefs.autoSync) return { shouldSync: false, reason: 'auto-sync-off' }
  if (!hasSyncableAccount) return { shouldSync: false, reason: 'no-syncable-account' }

  // An attempt that just happened blocks another one even if the interval
  // has otherwise elapsed — this is the loop guard, so it's checked before
  // the interval rather than folded into it.
  if (lastAttemptAt !== null && now - lastAttemptAt < MIN_RETRY_GAP_MS) {
    return { shouldSync: false, reason: 'attempt-too-recent' }
  }

  // Never synced and nothing attempted recently: sync now. This is what
  // makes a freshly-connected account populate without the user having to
  // find the Sync now button.
  if (lastSyncedAt === null) return { shouldSync: true }

  const intervalMs = prefs.syncIntervalMinutes * 60_000
  if (now - lastSyncedAt >= intervalMs) return { shouldSync: true }

  return { shouldSync: false, reason: 'interval-not-elapsed' }
}

/** Human-readable form of a skip reason, for the Connect screen. */
export function describeSkipReason(reason: SyncSkipReason): string {
  switch (reason) {
    case 'auto-sync-off':
      return 'Automatic sync is off — use Sync now, or turn it on below.'
    case 'no-syncable-account':
      return 'No connected calendar is active.'
    case 'interval-not-elapsed':
      return 'Synced recently — next check is scheduled.'
    case 'attempt-too-recent':
      return 'Just tried — waiting a moment before retrying.'
  }
}

/**
 * Milliseconds until the next sync is due, for scheduling a timer.
 *
 * Clamped to at least MIN_RETRY_GAP_MS so a timer can never be scheduled
 * for ~0ms and spin.
 */
export function msUntilNextSync(input: Omit<SyncDecisionInput, 'hasSyncableAccount'>): number {
  const { prefs, lastSyncedAt, lastAttemptAt, now } = input
  const intervalMs = prefs.syncIntervalMinutes * 60_000

  const dueFromLastSync = lastSyncedAt === null ? 0 : lastSyncedAt + intervalMs - now
  const dueFromLastAttempt = lastAttemptAt === null ? 0 : lastAttemptAt + MIN_RETRY_GAP_MS - now

  return Math.max(MIN_RETRY_GAP_MS, dueFromLastSync, dueFromLastAttempt)
}
