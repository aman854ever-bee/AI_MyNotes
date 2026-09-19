// What each calendar provider needs before it can be connected, and how to
// read back the result of checking.
//
// Pure and zero-dependency on purpose (same reasoning as lib/format.ts and
// lib/micGuidance.ts — see docs/testing.md) so the requirement lists and
// the pass/fail roll-up are unit testable without `npm install`. The half
// that actually talks to Supabase lives in lib/calendarSetup.ts.
//
// A deliberate constraint runs through all of this: **no OAuth client
// secret is ever collected by this app**. Secrets belong in Supabase's own
// provider configuration and in Edge Function secrets, where the browser
// can't see them (ADR 0007). So the app's job is to tell the user exactly
// what to set and where, give them the values it *can* derive (redirect
// URL, scopes), and then verify the result — not to take the secret itself.

export type CalendarProviderId = 'google' | 'microsoft'

export interface SetupStep {
  /** Short label, e.g. "Enable the Google Calendar API". */
  title: string
  /** Where the user does this. */
  where: string
  /** Optional exact value to copy (redirect URL, scope string, secret name). */
  value?: string
  /** True when this step involves a secret Claude/the app must never see. */
  secret?: boolean
}

export interface ProviderRequirements {
  id: CalendarProviderId
  label: string
  /** What the user gets out of connecting it. */
  purpose: string
  steps: SetupStep[]
  /** Supabase Auth provider key this maps to. */
  supabaseProvider: 'google' | 'azure'
  /** OAuth scopes the connect flow asks for. */
  scopes: string
  /** Edge Function secret names calendar-sync needs for this provider. */
  functionSecrets: string[]
}

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const MICROSOFT_CALENDAR_SCOPE = 'offline_access Calendars.Read'

/**
 * The redirect URL the provider must be told to allow.
 *
 * Supabase always terminates the OAuth round-trip at its own
 * /auth/v1/callback; the app's own URL is only where Supabase sends the
 * browser afterwards. Getting these two mixed up is the single most common
 * reason a connect attempt dies with redirect_uri_mismatch, so the setup
 * list shows the Supabase one explicitly rather than leaving it implied.
 */
export function providerRedirectUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/callback`
}

export function requirementsFor(providerId: CalendarProviderId, supabaseUrl: string): ProviderRequirements {
  const redirect = providerRedirectUrl(supabaseUrl)

  if (providerId === 'google') {
    return {
      id: 'google',
      label: 'Google Calendar / Meet',
      purpose: 'Pulls your upcoming events in, with Meet links, so meetings show up ready to record.',
      supabaseProvider: 'google',
      scopes: GOOGLE_CALENDAR_SCOPE,
      functionSecrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
      steps: [
        {
          title: 'Enable the Google Calendar API',
          where: 'Google Cloud Console → APIs & Services → Library',
        },
        {
          title: 'Create an OAuth 2.0 Client ID (Web application)',
          where: 'Google Cloud Console → APIs & Services → Credentials',
        },
        {
          title: 'Add this as an Authorized redirect URI',
          where: 'On that OAuth client',
          value: redirect,
        },
        {
          title: 'Paste the Client ID and Client Secret into Supabase',
          where: 'Supabase → Authentication → Sign In / Providers → Google',
          secret: true,
        },
        {
          title: 'Set the same pair as Edge Function secrets',
          where: 'Supabase → Edge Functions → Secrets (calendar-sync refreshes tokens server-side)',
          value: 'GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET',
          secret: true,
        },
      ],
    }
  }

  return {
    id: 'microsoft',
    label: 'Microsoft Teams / Outlook',
    purpose: 'Pulls your Outlook calendar in, with Teams join links, alongside Google.',
    supabaseProvider: 'azure',
    scopes: MICROSOFT_CALENDAR_SCOPE,
    functionSecrets: ['MICROSOFT_OAUTH_CLIENT_ID', 'MICROSOFT_OAUTH_CLIENT_SECRET', 'MICROSOFT_OAUTH_TENANT'],
    steps: [
      {
        title: 'Register an application',
        where: 'Azure Portal → Microsoft Entra ID → App registrations → New registration',
      },
      {
        title: 'Add this as a Web redirect URI',
        where: 'On that app registration → Authentication',
        value: redirect,
      },
      {
        title: 'Add delegated Microsoft Graph permissions',
        where: 'On that app registration → API permissions',
        value: 'Calendars.Read, offline_access',
      },
      {
        title: 'Create a client secret',
        where: 'On that app registration → Certificates & secrets',
        secret: true,
      },
      {
        title: 'Paste the Application (client) ID and secret into Supabase',
        where: 'Supabase → Authentication → Sign In / Providers → Azure',
        secret: true,
      },
      {
        title: 'Set the client ID, secret and tenant as Edge Function secrets',
        where: 'Supabase → Edge Functions → Secrets',
        value: 'MICROSOFT_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_SECRET, MICROSOFT_OAUTH_TENANT',
        secret: true,
      },
    ],
  }
}

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skipped'

export interface CheckResult {
  id: string
  label: string
  status: CheckStatus
  /** Shown under the label when not passing — says what to do about it. */
  detail?: string
}

/**
 * Whether the connect button should be enabled.
 *
 * A 'warn' is explicitly not blocking: those cover things that can only be
 * confirmed after a real connection exists (whether sync actually returns
 * events, say), and refusing to let the user connect because of them would
 * be circular.
 */
export function canConnect(checks: CheckResult[]): boolean {
  return checks.every((c) => c.status !== 'fail')
}

/** One-line roll-up for the card header. */
export function summarize(checks: CheckResult[]): { status: CheckStatus; text: string } {
  if (checks.length === 0) return { status: 'skipped', text: 'Not checked yet' }
  const failed = checks.filter((c) => c.status === 'fail')
  if (failed.length > 0) {
    return {
      status: 'fail',
      text: failed.length === 1 ? failed[0].label : `${failed.length} things need setting up`,
    }
  }
  const warned = checks.filter((c) => c.status === 'warn')
  if (warned.length > 0) {
    return { status: 'warn', text: warned.length === 1 ? warned[0].label : `${warned.length} things to check` }
  }
  return { status: 'pass', text: 'Ready to connect' }
}
