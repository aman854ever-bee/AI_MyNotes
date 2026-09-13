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
//           (Microsoft/Teams support added in a later piece)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')

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

async function fetchGoogleEvents(accessToken: string): Promise<GoogleEvent[]> {
  const now = new Date()
  const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  // A client scoped to the caller's own JWT — every query below is
  // naturally limited to this user's own rows by RLS, so there's no need
  // for a service-role key here.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: accounts, error: accountsError } = await supabase
    .from('calendar_accounts')
    .select('id, user_id, provider, refresh_token')

  if (accountsError) {
    console.error('[calendar-sync] failed to load calendar_accounts', accountsError)
    return json({ error: 'Could not load connected calendars' }, 500)
  }

  let synced = 0

  for (const account of (accounts ?? []) as CalendarAccountRow[]) {
    if (account.provider !== 'google') continue // Microsoft support lands in a later piece

    const refreshed = await refreshGoogleAccessToken(account.refresh_token)
    if (!refreshed) continue

    await supabase
      .from('calendar_accounts')
      .update({
        access_token: refreshed.accessToken,
        access_token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)

    const events = await fetchGoogleEvents(refreshed.accessToken)

    for (const event of events) {
      const startAt = event.start?.dateTime ?? event.start?.date
      if (!startAt) continue
      const { error: upsertError } = await supabase.from('calendar_events').upsert(
        {
          user_id: userData.user.id,
          calendar_account_id: account.id,
          provider: 'google',
          external_id: event.id,
          title: event.summary || 'Untitled meeting',
          start_at: new Date(startAt).toISOString(),
          end_at: event.end?.dateTime || event.end?.date ? new Date((event.end!.dateTime ?? event.end!.date)!).toISOString() : null,
          join_url: googleJoinUrl(event),
          organizer_name: event.organizer?.displayName || event.organizer?.email || null,
          location: event.location || null,
          is_cancelled: event.status === 'cancelled',
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'calendar_account_id,external_id' },
      )
      if (!upsertError) synced++
    }
  }

  return json({ synced })
})
