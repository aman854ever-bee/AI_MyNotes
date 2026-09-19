import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SYNC_PREFERENCES,
  MAX_SYNC_INTERVAL_MINUTES,
  MAX_SYNC_WINDOW_DAYS,
  MIN_RETRY_GAP_MS,
  MIN_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_WINDOW_DAYS,
  describeSkipReason,
  msUntilNextSync,
  normalizeSyncPreferences,
  shouldAutoSync,
  type SyncPreferences,
  type SyncSkipReason,
} from './syncSchedule.ts'

const NOW = 1_800_000_000_000
const MINUTE = 60_000
const prefs = (over: Partial<SyncPreferences> = {}): SyncPreferences => ({
  ...DEFAULT_SYNC_PREFERENCES,
  ...over,
})

test('missing preferences fall back to the migration defaults', () => {
  assert.deepEqual(normalizeSyncPreferences(null), DEFAULT_SYNC_PREFERENCES)
  assert.deepEqual(normalizeSyncPreferences({}), DEFAULT_SYNC_PREFERENCES)
})

test('out-of-range values are clamped, not trusted', () => {
  // An interval of 0 would mean a sync loop, which is the expensive bug
  // this clamping exists to make impossible.
  assert.equal(normalizeSyncPreferences({ syncIntervalMinutes: 0 }).syncIntervalMinutes, MIN_SYNC_INTERVAL_MINUTES)
  assert.equal(normalizeSyncPreferences({ syncIntervalMinutes: -99 }).syncIntervalMinutes, MIN_SYNC_INTERVAL_MINUTES)
  assert.equal(
    normalizeSyncPreferences({ syncIntervalMinutes: 999_999 }).syncIntervalMinutes,
    MAX_SYNC_INTERVAL_MINUTES,
  )
  assert.equal(normalizeSyncPreferences({ syncWindowDays: 0 }).syncWindowDays, MIN_SYNC_WINDOW_DAYS)
  assert.equal(normalizeSyncPreferences({ syncWindowDays: 5000 }).syncWindowDays, MAX_SYNC_WINDOW_DAYS)
})

test('garbage values fall back rather than producing NaN', () => {
  // A NaN interval would make every comparison false and silently stop
  // syncing forever.
  for (const bad of [undefined, null, 'abc', {}, [], NaN, Infinity]) {
    const out = normalizeSyncPreferences({ syncIntervalMinutes: bad })
    assert.equal(out.syncIntervalMinutes, DEFAULT_SYNC_PREFERENCES.syncIntervalMinutes, `failed for ${String(bad)}`)
    assert.ok(Number.isFinite(out.syncIntervalMinutes))
  }
})

test('numeric strings from a form input are accepted', () => {
  assert.equal(normalizeSyncPreferences({ syncIntervalMinutes: '45' }).syncIntervalMinutes, 45)
  assert.equal(normalizeSyncPreferences({ syncWindowDays: '7' }).syncWindowDays, 7)
})

test('fractional values are rounded to whole units', () => {
  assert.equal(normalizeSyncPreferences({ syncIntervalMinutes: 30.6 }).syncIntervalMinutes, 31)
})

test('auto-sync off means never automatic', () => {
  const decision = shouldAutoSync({
    prefs: prefs({ autoSync: false }),
    lastSyncedAt: null,
    lastAttemptAt: null,
    hasSyncableAccount: true,
    now: NOW,
  })
  assert.deepEqual(decision, { shouldSync: false, reason: 'auto-sync-off' })
})

test('nothing connected means nothing to sync', () => {
  const decision = shouldAutoSync({
    prefs: prefs(),
    lastSyncedAt: null,
    lastAttemptAt: null,
    hasSyncableAccount: false,
    now: NOW,
  })
  assert.deepEqual(decision, { shouldSync: false, reason: 'no-syncable-account' })
})

test('a never-synced account syncs immediately', () => {
  // This is what makes a freshly connected calendar populate without the
  // user hunting for the Sync now button.
  const decision = shouldAutoSync({
    prefs: prefs(),
    lastSyncedAt: null,
    lastAttemptAt: null,
    hasSyncableAccount: true,
    now: NOW,
  })
  assert.deepEqual(decision, { shouldSync: true })
})

test('a recent attempt blocks a retry loop even when never synced', () => {
  // The failure mode: provider is down, every mount retries instantly.
  const decision = shouldAutoSync({
    prefs: prefs(),
    lastSyncedAt: null,
    lastAttemptAt: NOW - 1000,
    hasSyncableAccount: true,
    now: NOW,
  })
  assert.deepEqual(decision, { shouldSync: false, reason: 'attempt-too-recent' })
})

test('the retry guard beats the interval, not the other way round', () => {
  // Interval long since elapsed, but an attempt just happened.
  const decision = shouldAutoSync({
    prefs: prefs({ syncIntervalMinutes: 5 }),
    lastSyncedAt: NOW - 60 * MINUTE,
    lastAttemptAt: NOW - 1000,
    hasSyncableAccount: true,
    now: NOW,
  })
  assert.deepEqual(decision, { shouldSync: false, reason: 'attempt-too-recent' })
})

test('sync waits until the interval has elapsed', () => {
  const justSynced = shouldAutoSync({
    prefs: prefs({ syncIntervalMinutes: 30 }),
    lastSyncedAt: NOW - 10 * MINUTE,
    lastAttemptAt: null,
    hasSyncableAccount: true,
    now: NOW,
  })
  assert.deepEqual(justSynced, { shouldSync: false, reason: 'interval-not-elapsed' })

  const overdue = shouldAutoSync({
    prefs: prefs({ syncIntervalMinutes: 30 }),
    lastSyncedAt: NOW - 31 * MINUTE,
    lastAttemptAt: null,
    hasSyncableAccount: true,
    now: NOW,
  })
  assert.deepEqual(overdue, { shouldSync: true })
})

test('the interval boundary is inclusive', () => {
  const exactly = shouldAutoSync({
    prefs: prefs({ syncIntervalMinutes: 30 }),
    lastSyncedAt: NOW - 30 * MINUTE,
    lastAttemptAt: null,
    hasSyncableAccount: true,
    now: NOW,
  })
  assert.deepEqual(exactly, { shouldSync: true })
})

test('every skip reason has readable text', () => {
  const reasons: SyncSkipReason[] = [
    'auto-sync-off',
    'no-syncable-account',
    'interval-not-elapsed',
    'attempt-too-recent',
  ]
  for (const reason of reasons) {
    const text = describeSkipReason(reason)
    assert.ok(text.trim().length > 0, `${reason} has no text`)
  }
})

test('the next-sync timer is never scheduled for zero', () => {
  // A 0ms timer would spin the event loop.
  const soon = msUntilNextSync({
    prefs: prefs({ syncIntervalMinutes: 5 }),
    lastSyncedAt: NOW - 999 * MINUTE,
    lastAttemptAt: NOW - 999 * MINUTE,
    now: NOW,
  })
  assert.ok(soon >= MIN_RETRY_GAP_MS, `expected >= ${MIN_RETRY_GAP_MS}, got ${soon}`)

  const never = msUntilNextSync({ prefs: prefs(), lastSyncedAt: null, lastAttemptAt: null, now: NOW })
  assert.ok(never >= MIN_RETRY_GAP_MS)
})

test('the next-sync timer reflects the interval when it is the binding constraint', () => {
  const wait = msUntilNextSync({
    prefs: prefs({ syncIntervalMinutes: 30 }),
    lastSyncedAt: NOW - 10 * MINUTE,
    lastAttemptAt: null,
    now: NOW,
  })
  assert.equal(wait, 20 * MINUTE)
})

test('the next-sync timer respects a very recent attempt', () => {
  // Interval elapsed long ago, but an attempt was 10s ago. The retry gap
  // (60s from the attempt = 50s away) and the floor (60s) both apply, so
  // the floor wins.
  const wait = msUntilNextSync({
    prefs: prefs({ syncIntervalMinutes: 5 }),
    lastSyncedAt: NOW - 60 * MINUTE,
    lastAttemptAt: NOW - 10_000,
    now: NOW,
  })
  assert.equal(wait, MIN_RETRY_GAP_MS)
})
