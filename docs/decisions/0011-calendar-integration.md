# ADR 0011: Calendar integration (Google Calendar / Microsoft Graph)

## Status
Accepted

## Context
The user wants meeting invites from Google Meet and Microsoft Teams to show
up in MyNotes — as the source for the "Day for me" dashboard card and the
15-minutes-before reminder (ADR 0012). This means reading events from the
user's real Google Calendar and Microsoft 365 (Outlook/Teams) calendar.

## Decision
**Use Supabase Auth's linked-identity OAuth** rather than building a
separate OAuth/PKCE flow by hand.

Supabase Auth already handles sign-in for this app (magic link). It also
supports:
- `supabase.auth.linkIdentity({ provider, options: { scopes, queryParams:
  { access_type: 'offline', prompt: 'consent' } } })` to attach a Google or
  Azure (Microsoft) identity to the *existing* signed-in user, requesting
  extra scopes (`https://www.googleapis.com/auth/calendar.readonly` for
  Google, `Calendars.Read` for Microsoft Graph).
- The OAuth callback returns a `provider_token` (short-lived access token)
  and, when `access_type=offline` was requested, a `provider_refresh_token`.

The app captures those tokens client-side right after linking and stores
them in a new `calendar_accounts` table (one row per user per provider),
RLS-scoped to `user_id = auth.uid()` — same ownership pattern as every
other table in this schema. A `refresh` edge function (added with the
Google/Microsoft connect features themselves, not in this schema-only
step) uses the stored refresh token to mint fresh access tokens for the
periodic sync and for the reminder-scanning cron job (ADR 0012).

Synced events land in a new `calendar_events` table — one row per external
calendar event, keyed on `(calendar_account_id, external_id)` so re-syncs
upsert instead of duplicating. `join_url` holds the Teams/Meet link when
the event has one.

### Why not a custom OAuth flow?
Supabase already owns this app's auth (Site URL / Redirect URLs are
configured — see the backend-provisioning work). Building a second,
separate OAuth implementation would duplicate that infrastructure and add
a second set of redirect-URI/consent-screen concerns. Piggybacking on
`linkIdentity` means one Google Cloud OAuth app and one Azure app
registration are the only new external accounts needed.

### What the user has to set up (real accounts — Claude cannot do this)
Same division of labor as backend provisioning (see project status doc):
1. **Google**: a Google Cloud project → OAuth consent screen → OAuth
   Client ID (Web application), with the Supabase Auth callback URL
   (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized
   redirect URI, and the Google Calendar API enabled.
2. **Microsoft**: an Azure Portal app registration (Microsoft Entra ID),
   same Supabase callback URL as a redirect URI, with
   `Calendars.Read` delegated permission under Microsoft Graph.
3. Both providers get toggled on in Supabase Dashboard → Authentication →
   Providers, where the Client ID (not secret) is pasted by Claude and the
   Client Secret is pasted by the user directly — same secret-handling
   pattern as Deepgram/Anthropic.

### Token storage tradeoff
`calendar_accounts.refresh_token` is stored as plain text in a
RLS-protected row (readable only by its owner and the service role).
This is consistent with this project's existing risk posture — no column
in this schema is encrypted at rest beyond RLS + Supabase's own storage
security. A future hardening step would move it into Supabase Vault;
not done now to keep this shippable in the smaller-branches plan the user
chose.

## Consequences
- New tables: `calendar_accounts`, `calendar_events` (this migration).
- Two new pieces of app work, each its own branch: Google Calendar connect,
  then Microsoft Teams/Outlook connect — both built against the same two
  tables, differing only in provider-specific scopes/API calls.
- Real external setup (Google Cloud + Azure) blocks each branch's OAuth
  connect button from actually working until the user completes it —
  Claude will build everything that doesn't depend on it in the meantime.
