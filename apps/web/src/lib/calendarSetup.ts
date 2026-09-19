// Real preflight validation for a calendar provider, run before the user
// is allowed to connect it (and re-runnable afterwards to diagnose a
// connection that has stopped working).
//
// Every check here does actual work against the live project — none of it
// is inferred from config the app happens to know about. Where a check
// cannot be performed honestly, it reports 'skipped' rather than 'pass';
// a green tick that means "we didn't look" is worse than no tick.
//
// The requirement lists and the pass/fail roll-up live in
// lib/calendarRequirements.ts (pure, unit tested).

import { supabase, isSupabaseConfigured } from './supabaseClient'
import { oauthRedirectTo } from './capacitorAuth'
import {
  requirementsFor,
  type CalendarProviderId,
  type CheckResult,
} from './calendarRequirements'

/**
 * Does the provider actually generate an authorize URL?
 *
 * This is the check that matters most, and the only way to answer it
 * without sending the user on a round-trip: ask supabase-js to build the
 * OAuth URL with skipBrowserRedirect, so nothing navigates. If the
 * provider isn't enabled in the Supabase project, or its client ID/secret
 * are missing, this comes back as an error instead of a URL. No account is
 * linked and no consent is recorded — linking only happens once the user
 * completes the flow — so this is safe to run on demand.
 */
async function checkProviderEnabled(providerId: CalendarProviderId): Promise<CheckResult> {
  const id = 'provider-enabled'
  const label = 'Provider is enabled in Supabase'
  if (!supabase) return { id, label, status: 'fail', detail: 'Supabase client is not configured.' }

  const req = requirementsFor(providerId, '')
  try {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: req.supabaseProvider,
      options: {
        scopes: req.scopes,
        redirectTo: oauthRedirectTo(),
        skipBrowserRedirect: true,
      },
    })

    if (error) {
      const message = error.message || ''
      if (/not enabled|unsupported provider|provider is not enabled/i.test(message)) {
        return {
          id,
          label,
          status: 'fail',
          detail: `${req.supabaseProvider} is not enabled in Supabase → Authentication → Sign In / Providers.`,
        }
      }
      if (/manual linking|identity linking/i.test(message)) {
        return {
          id,
          label,
          status: 'fail',
          detail: 'Turn on "Manual linking" in Supabase → Authentication → Sign In / Providers.',
        }
      }
      return { id, label, status: 'fail', detail: message }
    }

    if (!data?.url) {
      return { id, label, status: 'fail', detail: 'Supabase returned no authorize URL for this provider.' }
    }
    return { id, label, status: 'pass' }
  } catch (err) {
    return {
      id,
      label,
      status: 'fail',
      detail: err instanceof Error ? err.message : 'Could not reach Supabase to check the provider.',
    }
  }
}

/** Is the schema from migrations 0005/0006 actually applied? */
async function checkTables(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  if (!supabase) return results

  for (const [table, columns, label] of [
    ['calendar_accounts', 'id, sync_enabled, last_synced_at', 'Calendar tables exist (migrations 0005 + 0006)'],
    ['calendar_events', 'id, join_url', 'Event table exists'],
  ] as const) {
    const { error } = await supabase.from(table).select(columns).limit(1)
    if (!error) {
      results.push({ id: `table-${table}`, label, status: 'pass' })
      continue
    }
    // 42P01 = undefined_table, 42703 = undefined_column. Both mean a
    // migration hasn't been applied — and per the project's own notes,
    // `supabase db push` silently no-ops on this repo, so the fix is the
    // dashboard SQL editor.
    const missing = error.code === '42P01' || error.code === '42703'
    results.push({
      id: `table-${table}`,
      label,
      status: 'fail',
      detail: missing
        ? `Run the migration in Supabase → SQL Editor (\`${table}\` is missing or out of date).`
        : error.message,
    })
  }
  return results
}

/** Is the calendar-sync function deployed, and does it have its secrets? */
async function checkSyncFunction(providerId: CalendarProviderId): Promise<CheckResult> {
  const id = 'sync-function'
  const label = 'calendar-sync function is deployed'
  if (!supabase) return { id, label, status: 'skipped' }

  try {
    // dryRun asks the function to report its own readiness without
    // refreshing tokens or hitting the provider's API.
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean
      ready?: Record<string, boolean>
      error?: string
    }>('calendar-sync', { body: { dryRun: true, provider: providerId } })

    if (error) {
      return {
        id,
        label,
        status: 'fail',
        detail: 'Deploy it with `supabase functions deploy calendar-sync`.',
      }
    }

    const ready = data?.ready?.[providerId]
    if (ready === false) {
      const req = requirementsFor(providerId, '')
      return {
        id,
        label,
        status: 'fail',
        detail: `Set ${req.functionSecrets.join(', ')} in Supabase → Edge Functions → Secrets.`,
      }
    }
    if (ready === undefined) {
      // An older deployment that predates dryRun — it's there, but it
      // can't tell us about its secrets, so don't claim it can.
      return {
        id,
        label,
        status: 'warn',
        detail: 'Deployed, but too old to report its secrets. Redeploy calendar-sync to check them.',
      }
    }
    return { id, label, status: 'pass' }
  } catch {
    return { id, label, status: 'fail', detail: 'Deploy it with `supabase functions deploy calendar-sync`.' }
  }
}

/**
 * Runs every check for one provider, in order, and returns them all.
 *
 * Ordering is deliberate: the cheap local checks come first so an
 * unconfigured project fails fast with an obvious reason, rather than
 * surfacing a confusing downstream error from a network call that never
 * had a chance of working.
 */
export async function validateProviderSetup(providerId: CalendarProviderId): Promise<CheckResult[]> {
  const checks: CheckResult[] = []

  if (!isSupabaseConfigured || !supabase) {
    checks.push({
      id: 'supabase',
      label: 'Supabase is configured',
      status: 'fail',
      detail: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env.',
    })
    return checks
  }
  checks.push({ id: 'supabase', label: 'Supabase is configured', status: 'pass' })

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    checks.push({
      id: 'signed-in',
      label: 'Signed in',
      status: 'fail',
      detail: 'Connecting a calendar links it to your account, so you need to be signed in first.',
    })
    return checks
  }
  checks.push({ id: 'signed-in', label: 'Signed in', status: 'pass' })

  checks.push(...(await checkTables()))
  checks.push(await checkProviderEnabled(providerId))
  checks.push(await checkSyncFunction(providerId))

  return checks
}

/**
 * Post-connection health check for an account that already exists.
 *
 * Connecting successfully isn't the same as working: the refresh token is
 * only handed over once, at link time, and if it wasn't captured then
 * server-side sync can never run no matter how healthy everything else
 * looks. That failure is invisible from the UI otherwise — the account
 * shows as "connected" and simply never produces events.
 */
export async function checkConnectedAccount(providerId: CalendarProviderId): Promise<CheckResult> {
  const id = 'refresh-token'
  const label = 'Offline access was granted'
  if (!supabase) return { id, label, status: 'skipped' }

  const { data, error } = await supabase
    .from('calendar_accounts')
    .select('refresh_token')
    .eq('provider', providerId)
    .maybeSingle()

  if (error || !data) return { id, label, status: 'skipped' }

  if (!data.refresh_token) {
    return {
      id,
      label,
      status: 'fail',
      detail: 'Disconnect and reconnect, approving the consent screen — sync needs offline access.',
    }
  }
  return { id, label, status: 'pass' }
}
