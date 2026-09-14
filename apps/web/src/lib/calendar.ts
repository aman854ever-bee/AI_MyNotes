import { supabase } from './supabaseClient'
import { isNativePlatform, oauthRedirectTo, openOAuthUrl } from './capacitorAuth'

// Calendar integration client lib (ADR 0011). Connecting is
// supabase.auth.linkIdentity() with extra OAuth scopes — the browser
// redirects to the provider and back; the returned session carries a
// short-lived provider_token and (since we ask for offline access) a
// provider_refresh_token, which this module captures into
// `calendar_accounts` right after the redirect completes. Everything
// after that (refreshing the access token, calling the Calendar API) is
// server-side, in the `calendar-sync` edge function — the refresh needs
// the OAuth Client Secret, which never belongs in client code.

export type CalendarProvider = 'google' | 'microsoft'

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const MICROSOFT_CALENDAR_SCOPE = 'offline_access Calendars.Read'

export interface CalendarAccount {
  id: string
  provider: CalendarProvider
  provider_email: string | null
  connected_at: string
}

export interface CalendarEvent {
  id: string
  provider: CalendarProvider
  title: string
  start_at: string
  end_at: string | null
  join_url: string | null
  organizer_name: string | null
  location: string | null
  is_cancelled: boolean
}

function scopeFor(provider: CalendarProvider): string {
  return provider === 'google' ? GOOGLE_CALENDAR_SCOPE : MICROSOFT_CALENDAR_SCOPE
}

/**
 * Kicks off the connect flow.
 *
 * Web: supabase-js redirects the browser itself (unchanged behavior).
 * Native (spike/capacitor-oauth): skipBrowserRedirect so we get the OAuth
 * URL back instead of an automatic WebView navigation, then open it in a
 * Custom Tab via openOAuthUrl() — see lib/capacitorAuth.ts for why the
 * WebView-based redirect doesn't work reliably on Android.
 */
export async function connectCalendar(provider: CalendarProvider): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }
  const native = isNativePlatform()
  const { data, error } = await supabase.auth.linkIdentity({
    provider: provider === 'google' ? 'google' : 'azure',
    options: {
      scopes: scopeFor(provider),
      queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'consent' },
      redirectTo: oauthRedirectTo(),
      skipBrowserRedirect: native,
    },
  })
  if (error) return { ok: false, message: error.message }
  if (native && data?.url) {
    await openOAuthUrl(data.url)
  }
  return { ok: true } // browser navigates away before this resolves, in practice (web) or the Custom Tab takes over (native)
}

/**
 * Call once, high up in the app (App.tsx), on every auth state change.
 * Right after a linkIdentity() redirect completes, the session Supabase
 * hands back carries provider_token/provider_refresh_token — that's the
 * only moment these are available, so they're captured into
 * `calendar_accounts` immediately rather than re-derived later.
 */
export async function captureLinkedCalendarTokens(session: {
  provider_token?: string | null
  provider_refresh_token?: string | null
  user?: { email?: string | null; app_metadata?: { provider?: string } } | null
}): Promise<void> {
  if (!supabase) return
  if (!session.provider_refresh_token) return // not an OAuth-linking event

  const rawProvider = session.user?.app_metadata?.provider
  const provider: CalendarProvider | null = rawProvider === 'google' ? 'google' : rawProvider === 'azure' ? 'microsoft' : null
  if (!provider) return

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return

  await supabase.from('calendar_accounts').upsert(
    {
      user_id: userId,
      provider,
      provider_email: session.user?.email ?? null,
      refresh_token: session.provider_refresh_token,
      access_token: session.provider_token ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  )
}

export async function listCalendarAccounts(): Promise<CalendarAccount[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('calendar_accounts')
    .select('id, provider, provider_email, connected_at')
    .order('connected_at', { ascending: true })
  if (error) {
    console.error('[mynotes] failed to list calendar accounts', error)
    return []
  }
  return data ?? []
}

export async function disconnectCalendar(accountId: string): Promise<void> {
  if (!supabase) return
  await supabase.from('calendar_accounts').delete().eq('id', accountId)
}

/** Triggers the server-side refresh + Calendar API fetch for every connected account. */
export async function syncCalendars(): Promise<{ ok: true; synced: number } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }
  try {
    const { data, error } = await supabase.functions.invoke<{ synced?: number; error?: string }>('calendar-sync', {
      body: {},
    })
    if (error || !data) return { ok: false, message: 'The calendar sync request failed.' }
    if (data.error) return { ok: false, message: data.error }
    return { ok: true, synced: data.synced ?? 0 }
  } catch (err) {
    console.error('[mynotes] calendar sync failed', err)
    return { ok: false, message: 'The calendar sync request failed unexpectedly.' }
  }
}

export async function listUpcomingCalendarEvents(withinDays = 14): Promise<CalendarEvent[]> {
  if (!supabase) return []
  const now = new Date()
  const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, provider, title, start_at, end_at, join_url, organizer_name, location, is_cancelled')
    .eq('is_cancelled', false)
    .gte('start_at', now.toISOString())
    .lte('start_at', until.toISOString())
    .order('start_at', { ascending: true })
  if (error) {
    console.error('[mynotes] failed to list calendar events', error)
    return []
  }
  return data ?? []
}

/** Today's events only, for the "Day for me" dashboard card (ADR 0012). */
export async function listTodaysCalendarEvents(): Promise<CalendarEvent[]> {
  if (!supabase) return []
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, provider, title, start_at, end_at, join_url, organizer_name, location, is_cancelled')
    .eq('is_cancelled', false)
    .gte('start_at', dayStart.toISOString())
    .lt('start_at', dayEnd.toISOString())
    .order('start_at', { ascending: true })
  if (error) {
    console.error('[mynotes] failed to list today’s calendar events', error)
    return []
  }
  return data ?? []
}
