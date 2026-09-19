// Reading and writing the user's calendar sync preferences (migration
// 0007). The scheduling rules themselves are in lib/syncSchedule.ts,
// which is pure and tested; this is the Supabase-facing half.

import { supabase } from './supabaseClient'
import {
  DEFAULT_SYNC_PREFERENCES,
  normalizeSyncPreferences,
  type SyncPreferences,
} from './syncSchedule'

/**
 * Loads the current user's preferences.
 *
 * A missing row is normal, not an error — it means the user has never
 * changed anything, and the defaults deliberately match the column
 * defaults in 0007 and the values that used to be hardcoded. Returns
 * defaults rather than throwing so a fresh account behaves exactly as
 * before instead of blocking on setup.
 */
export async function loadSyncPreferences(): Promise<SyncPreferences> {
  if (!supabase) return { ...DEFAULT_SYNC_PREFERENCES }

  const { data, error } = await supabase
    .from('calendar_preferences')
    .select('auto_sync, sync_interval_minutes, sync_window_days')
    .maybeSingle()

  if (error) {
    // 42P01 means migration 0007 hasn't been applied. That's worth a log
    // line, but it must not break the page — the defaults reproduce the
    // previous behavior exactly.
    if (error.code !== 'PGRST116') {
      console.error('[mynotes] could not load calendar preferences', error)
    }
    return { ...DEFAULT_SYNC_PREFERENCES }
  }

  if (!data) return { ...DEFAULT_SYNC_PREFERENCES }

  return normalizeSyncPreferences({
    autoSync: data.auto_sync,
    syncIntervalMinutes: data.sync_interval_minutes,
    syncWindowDays: data.sync_window_days,
  })
}

/**
 * Saves preferences for the current user, creating the row if needed.
 *
 * Values are normalized before they go anywhere near the database, so a
 * bad value from a form can't land even if the CHECK constraints are
 * missing because 0007 hasn't been applied.
 */
export async function saveSyncPreferences(
  next: SyncPreferences,
): Promise<{ ok: true; prefs: SyncPreferences } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }

  const prefs = normalizeSyncPreferences(next)

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'Sign in to change sync settings.' }

  const { error } = await supabase.from('calendar_preferences').upsert(
    {
      user_id: userId,
      auto_sync: prefs.autoSync,
      sync_interval_minutes: prefs.syncIntervalMinutes,
      sync_window_days: prefs.syncWindowDays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    if (error.code === '42P01') {
      return {
        ok: false,
        message: 'Run migration 0007 in the Supabase SQL Editor first — the preferences table is missing.',
      }
    }
    return { ok: false, message: error.message }
  }

  return { ok: true, prefs }
}

export interface AvailableCalendar {
  id: string
  name: string
  isPrimary: boolean
}

/**
 * Asks calendar-sync which calendars this account can read.
 *
 * Lives server-side for the same reason the sync itself does: listing
 * calendars needs a fresh access token, and refreshing one needs the OAuth
 * client secret (ADR 0011).
 */
export async function listAvailableCalendars(
  provider: 'google' | 'microsoft',
): Promise<{ ok: true; calendars: AvailableCalendar[] } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }

  try {
    const { data, error } = await supabase.functions.invoke<{
      calendars?: AvailableCalendar[]
      error?: string
    }>('calendar-sync', { body: { action: 'listCalendars', provider } })

    if (error) return { ok: false, message: 'Could not reach calendar-sync. Is it deployed?' }
    if (data?.error) return { ok: false, message: data.error }
    return { ok: true, calendars: data?.calendars ?? [] }
  } catch (err) {
    console.error('[mynotes] listCalendars failed', err)
    return { ok: false, message: 'Could not list calendars.' }
  }
}

/** Stores which calendar an account should read, and the Microsoft tenant. */
export async function setAccountCalendar(
  accountId: string,
  calendarId: string | null,
  calendarName: string | null,
): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }
  const { error } = await supabase
    .from('calendar_accounts')
    .update({ calendar_id: calendarId, calendar_name: calendarName })
    .eq('id', accountId)
  if (error) {
    if (error.code === '42703') {
      return { ok: false, message: 'Run migration 0007 in the Supabase SQL Editor first.' }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true }
}
