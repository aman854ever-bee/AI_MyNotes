// Supabase Edge Function: calendar-sync
//
// Refreshes each connected calendar account's access token (needs the
// OAuth Client Secret, which is why this can't run client-side — ADR
// 0011) and pulls upcoming events from that provider's Calendar API into
// `calendar_events`. Called on demand from the client (calendar.ts) and,
// once the notifications piece (ADR 0012) lands, also on a schedule.
//
// Deploy:   supabase functions deploy calendar-sync
// Secrets:  GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
//           MICROSOFT_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_SECRET,
//           MICROSOFT_OAUTH_TENANT  (tenant id, or "common")
//
// Also answers a readiness probe: POST { dryRun: true } returns which
// providers have their secrets set, without refreshing any token or
// calling any provider API. The Connect screen uses that to tell the user
// what is actually missing, instead of letting them connect an account
// that can never sync (lib/calendarSetup.ts).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
const MICROSOFT_OAUTH_CLIENT_ID = Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID')
const MICROSOFT_OAUTH_CLIENT_SECRET = Deno.env.get('MICROSOFT_OAUTH_CLIENT_SECRET')
const MICROSOFT_OAUTH_TENANT = Deno.env.get('MICROSOFT_OAUTH_TENANT') ?? 'common'

/** Which providers have everything they need, for the dryRun probe. */
function providerReadiness(): Record<'google' | 'microsoft', boolean> {
  return {
    google: Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET),
    microsoft: Boolean(MICROSOFT_OAUTH_CLIENT_ID && MICROSOFT_OAUTH_CLIENT_SECRET),
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface CalendarAccountRow {
  id: string
  user_id: string
  provider: 'google' | 'microsoft'
  refresh_token: string
  sync_enabled: boolean
  /** null = the provider's default (Google `primary`, MS default view). */
  calendar_id: string | null
  /** Per-account Microsoft tenant; falls back to the env var. Not a
   *  secret — it's the directory the app registration lives in. */
  oauth_tenant: string | null
}

/** Columns selected for sync. Kept in one place because a column added
 *  to the interface but not here silently arrives as undefined. */
const ACCOUNT_COLUMNS = 'id, user_id, provider, refresh_token, sync_enabled, calendar_id, oauth_tenant'

/** Same, minus the 0007 columns — used to retry when that migration
 *  hasn't been applied yet, so sync keeps working instead of failing
 *  outright on a project that's one migration behind. */
const ACCOUNT_COLUMNS_LEGACY = 'id, user_id, provider, refresh_token, sync_enabled'

const DEFAULT_WINDOW_DAYS = 14
const MIN_WINDOW_DAYS = 1
const MAX_WINDOW_DAYS = 60

function clampWindowDays(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WINDOW_DAYS
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.round(n)))
}

interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  hangoutLink?: string
  organizer?: { displayName?: string; email?: string }
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number } | null> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    console.error('[calendar-sync] GOOGLE_OAUTH_CLIENT_ID/SECRET not set')
    return null
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error('[calendar-sync] Google token refresh failed', res.status, await res.text())
    return null
  }
  const data = await res.json()
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 }
}

async function fetchGoogleEvents(
  accessToken: string,
  windowDays: number,
  calendarId: string | null,
): Promise<GoogleEvent[]> {
  const now = new Date()
  const until = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)
  // encodeURIComponent because a Google calendar id is usually an email
  // address, and secondary calendars' ids can contain characters that
  // would otherwise break the path.
  const calendar = encodeURIComponent(calendarId ?? 'primary')
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendar}/events`)
  url.searchParams.set('timeMin', now.toISOString())
  url.searchParams.set('timeMax', until.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '50')

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    console.error('[calendar-sync] Google Calendar API error', res.status, await res.text())
    return []
  }
  const data = await res.json()
  return data.items ?? []
}

function googleJoinUrl(event: GoogleEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink
  const video = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')
  return video?.uri ?? null
}

interface GraphEvent {
  id: string
  subject?: string
  isCancelled?: boolean
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  onlineMeeting?: { joinUrl?: string } | null
  onlineMeetingUrl?: string | null
  organizer?: { emailAddress?: { name?: string; address?: string } }
  location?: { displayName?: string }
}

async function refreshMicrosoftAccessToken(
  refreshToken: string,
  tenant: string | null,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  if (!MICROSOFT_OAUTH_CLIENT_ID || !MICROSOFT_OAUTH_CLIENT_SECRET) {
    console.error('[calendar-sync] MICROSOFT_OAUTH_CLIENT_ID/SECRET not set')
    return null
  }
  // Per-account tenant wins over the deployment-wide env var. "common"
  // only works for a multi-tenant app registration; a single-tenant one
  // needs its own directory id, which is why this is settable at all.
  const effectiveTenant = tenant?.trim() || MICROSOFT_OAUTH_TENANT
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(effectiveTenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_OAUTH_CLIENT_ID,
      client_secret: MICROSOFT_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      // Microsoft requires the scopes again on refresh, and drops
      // offline_access silently if it isn't asked for — which would make
      // this the last refresh that ever works.
      scope: 'offline_access Calendars.Read',
    }),
  })
  if (!res.ok) {
    console.error('[calendar-sync] Microsoft token refresh failed', res.status, await res.text())
    return null
  }
  const data = await res.json()
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 }
}

async function fetchMicrosoftEvents(
  accessToken: string,
  windowDays: number,
  calendarId: string | null,
): Promise<GraphEvent[]> {
  const now = new Date()
  const until = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)
  const url = new URL(
    calendarId
      ? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
      : 'https://graph.microsoft.com/v1.0/me/calendarView',
  )
  url.searchParams.set('startDateTime', now.toISOString())
  url.searchParams.set('endDateTime', until.toISOString())
  url.searchParams.set('$orderby', 'start/dateTime')
  url.searchParams.set('$top', '50')
  url.searchParams.set(
    '$select',
    'id,subject,isCancelled,start,end,onlineMeeting,onlineMeetingUrl,organizer,location',
  )

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Without this Graph returns times in the mailbox's own timezone,
      // which varies per user and isn't stated in a parseable way.
      Prefer: 'outlook.timezone="UTC"',
    },
  })
  if (!res.ok) {
    console.error('[calendar-sync] Microsoft Graph API error', res.status, await res.text())
    return []
  }
  const data = await res.json()
  return data.value ?? []
}

/**
 * Graph returns "2026-09-19T10:30:00.0000000" with the zone in a separate
 * field rather than an offset in the string — so `new Date()` would read
 * it as local time. With the Prefer header above the zone is UTC, so the
 * fix is to mark it as such explicitly.
 */
function graphDateToIso(dateTime: string | undefined, timeZone: string | undefined): string | null {
  if (!dateTime) return null
  const hasZone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dateTime)
  const normalized = hasZone ? dateTime : `${dateTime}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    console.error('[calendar-sync] unparseable Graph date', dateTime, timeZone)
    return null
  }
  return parsed.toISOString()
}

function microsoftJoinUrl(event: GraphEvent): string | null {
  return event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? null
}

interface AvailableCalendar {
  id: string
  name: string
  isPrimary: boolean
}

async function listGoogleCalendars(accessToken: string): Promise<AvailableCalendar[]> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    console.error('[calendar-sync] Google calendarList error', res.status, await res.text())
    return []
  }
  const data = await res.json()
  return (data.items ?? []).map((c: { id: string; summary?: string; primary?: boolean }) => ({
    id: c.id,
    name: c.summary || c.id,
    isPrimary: c.primary === true,
  }))
}

async function listMicrosoftCalendars(accessToken: string): Promise<AvailableCalendar[]> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/calendars?$top=100&$select=id,name,isDefaultCalendar', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    console.error('[calendar-sync] Graph calendars error', res.status, await res.text())
    return []
  }
  const data = await res.json()
  return (data.value ?? []).map((c: { id: string; name?: string; isDefaultCalendar?: boolean }) => ({
    id: c.id,
    name: c.name || c.id,
    isPrimary: c.isDefaultCalendar === true,
  }))
}

/** The provider-independent shape a calendar_events row is built from. */
interface NormalizedEvent {
  external_id: string
  title: string
  start_at: string
  end_at: string | null
  join_url: string | null
  organizer_name: string | null
  location: string | null
  is_cancelled: boolean
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

function normalizeGoogleEvent(event: GoogleEvent): NormalizedEvent | null {
  // All-day events carry `date` instead of `dateTime`; both are valid, but
  // an event with neither has nothing to place on an agenda, so it's
  // dropped rather than stored at the epoch.
  const startRaw = event.start?.dateTime ?? event.start?.date
  if (!startRaw) return null
  const start = new Date(startRaw)
  if (Number.isNaN(start.getTime())) return null

  const endRaw = event.end?.dateTime ?? event.end?.date
  const end = endRaw ? new Date(endRaw) : null

  return {
    external_id: event.id,
    title: event.summary || 'Untitled meeting',
    start_at: start.toISOString(),
    end_at: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
    join_url: googleJoinUrl(event),
    organizer_name: event.organizer?.displayName || event.organizer?.email || null,
    location: event.location || null,
    is_cancelled: event.status === 'cancelled',
  }
}

function normalizeGraphEvent(event: GraphEvent): NormalizedEvent | null {
  const start = graphDateToIso(event.start?.dateTime, event.start?.timeZone)
  if (!start) return null

  return {
    external_id: event.id,
    title: event.subject || 'Untitled meeting',
    start_at: start,
    end_at: graphDateToIso(event.end?.dateTime, event.end?.timeZone),
    join_url: microsoftJoinUrl(event),
    organizer_name: event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address || null,
    location: event.location?.displayName || null,
    is_cancelled: event.isCancelled === true,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  let body: { dryRun?: boolean; action?: string; provider?: 'google' | 'microsoft' } = {}
  try {
    body = await req.json()
  } catch {
    body = {} // a plain sync call may legitimately send no body
  }

  // Readiness probe: answers "are this provider's secrets set?" without
  // refreshing a token or calling a provider API. Deliberately before the
  // auth lookup below is *not* an option — it still requires a valid JWT,
  // since it reveals which integrations a project has configured.
  if (body.dryRun) {
    const probeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: probeUser, error: probeError } = await probeClient.auth.getUser()
    if (probeError || !probeUser.user) return json({ error: 'Not authenticated' }, 401)
    return json({ ok: true, ready: providerReadiness() })
  }

  // A client scoped to the caller's own JWT — every query below is
  // naturally limited to this user's own rows by RLS, so there's no need
  // for a service-role key here.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)

  // Try the 0007 columns first, and fall back if that migration hasn't
  // been applied. Without the fallback, a project one migration behind
  // would stop syncing entirely rather than just losing the new options —
  // and on this repo migrations are applied by hand in the SQL editor, so
  // being one behind is a realistic state, not a hypothetical.
  let accounts: unknown[] | null = null
  let accountsError: { message?: string; code?: string } | null = null
  {
    const attempt = await supabase.from('calendar_accounts').select(ACCOUNT_COLUMNS)
    if (attempt.error && (attempt.error.code === '42703' || attempt.error.code === '42P01')) {
      console.warn('[calendar-sync] migration 0007 not applied — syncing without per-account options')
      const legacy = await supabase.from('calendar_accounts').select(ACCOUNT_COLUMNS_LEGACY)
      accounts = legacy.data
      accountsError = legacy.error
    } else {
      accounts = attempt.data
      accountsError = attempt.error
    }
  }

  if (accountsError) {
    console.error('[calendar-sync] failed to load calendar_accounts', accountsError)
    return json({ error: 'Could not load connected calendars' }, 500)
  }

  const typedAccounts = (accounts ?? []) as CalendarAccountRow[]

  // Listing calendars needs a fresh access token, which needs the client
  // secret — so it can't be done from the browser (ADR 0011).
  if (body.action === 'listCalendars') {
    const account = typedAccounts.find((a) => a.provider === body.provider)
    if (!account) return json({ error: 'That calendar is not connected.' }, 400)

    const refreshed =
      account.provider === 'google'
        ? await refreshGoogleAccessToken(account.refresh_token)
        : await refreshMicrosoftAccessToken(account.refresh_token, account.oauth_tenant ?? null)
    if (!refreshed) return json({ error: 'Could not refresh the access token for that account.' }, 502)

    const calendars =
      account.provider === 'google'
        ? await listGoogleCalendars(refreshed.accessToken)
        : await listMicrosoftCalendars(refreshed.accessToken)
    return json({ calendars })
  }

  // How far ahead to look. Falls back to the previous hardcoded 14 days
  // when the preferences row or table isn't there.
  let windowDays = DEFAULT_WINDOW_DAYS
  {
    const prefs = await supabase.from('calendar_preferences').select('sync_window_days').maybeSingle()
    if (!prefs.error && prefs.data) windowDays = clampWindowDays(prefs.data.sync_window_days)
  }

  let synced = 0

  for (const account of typedAccounts) {
    if (account.provider !== 'google' && account.provider !== 'microsoft') continue
    if (!account.sync_enabled) continue // paused from the Connect page — leave stored events as-is

    const refreshed =
      account.provider === 'google'
        ? await refreshGoogleAccessToken(account.refresh_token)
        : await refreshMicrosoftAccessToken(account.refresh_token, account.oauth_tenant ?? null)
    if (!refreshed) continue

    await supabase
      .from('calendar_accounts')
      .update({
        access_token: refreshed.accessToken,
        access_token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', account.id)

    // Both providers are normalized to the same row shape here, so the
    // upsert below (and everything downstream that reads calendar_events)
    // doesn't have to care which one an event came from.
    const calendarId = account.calendar_id ?? null
    const rows: NormalizedEvent[] =
      account.provider === 'google'
        ? (await fetchGoogleEvents(refreshed.accessToken, windowDays, calendarId))
            .map(normalizeGoogleEvent)
            .filter(isPresent)
        : (await fetchMicrosoftEvents(refreshed.accessToken, windowDays, calendarId))
            .map(normalizeGraphEvent)
            .filter(isPresent)

    for (const row of rows) {
      const { error: upsertError } = await supabase.from('calendar_events').upsert(
        {
          user_id: userData.user.id,
          calendar_account_id: account.id,
          provider: account.provider,
          ...row,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'calendar_account_id,external_id' },
      )
      if (!upsertError) synced++
    }
  }

  return json({ synced })
})
