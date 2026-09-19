# ADR 0015: Validate calendar setup before connecting, and add Microsoft/Teams sync

Date: 2026-09-19 · Status: Accepted

## Context

Two related problems, both reported as "it doesn't work" with no way for
the user to tell why.

**Microphone.** Both recorder screens collapsed every `getUserMedia`
failure into one message: "Microphone access was denied. Allow microphone
access in your browser's site settings." That sentence is wrong for most
of the ways capture actually fails — no microphone present, the mic held
by another app, a non-secure origin, an embedding host refusing capture by
policy — and it was being shown on Android, where there are no "browser
site settings" and where (per ADR's sibling fix, the `RECORD_AUDIO`
manifest commits) no permission prompt had ever been shown for the user to
have denied in the first place.

**Calendar.** Connecting a provider could produce an account that looks
connected and never syncs. The refresh token is handed over exactly once,
at link time; if `offline_access` wasn't granted, or the Edge Function's
OAuth secrets aren't set, or the migration wasn't applied, the UI still
shows "Connected" and simply never produces events. Microsoft/Teams was a
hardcoded "Soon" card with no implementation behind it at all.

## Decision

**Classify microphone failures, and give per-platform instructions.**
`lib/micGuidance.ts` (pure, unit tested) maps a `getUserMedia` error name
plus a detected host to a cause, a headline, ordered steps, and whether a
retry is even worth offering. `lib/microphone.ts` is the thin browser-
facing half. Both recorders now check `navigator.permissions` *before*
calling `getUserMedia`: when the state is already `denied`, the settings
steps are shown immediately rather than firing a call that cannot prompt
and cannot succeed.

**Ask MediaRecorder for a container explicitly.** `preferredAudioMimeType()`
picks the first supported candidate rather than accepting the platform
default, which differs between desktop Chrome and Android's WebView. The
blob goes on to Deepgram, so its type should not be a surprise.

**Validate calendar setup before allowing connect.** `lib/calendarSetup.ts`
runs real checks against the live project — not inferences from local
config:

- Supabase configured, and the user signed in
- `calendar_accounts` / `calendar_events` exist with the columns
  migrations 0005 and 0006 add (a `42P01`/`42703` is reported as "run the
  migration in the SQL Editor", since `supabase db push` is known to
  silently no-op on this repo)
- the provider is actually enabled in Supabase, checked by asking
  supabase-js to build the authorize URL with `skipBrowserRedirect: true`
  — no navigation, no linkage, no consent recorded, but a disabled or
  misconfigured provider returns an error instead of a URL
- `calendar-sync` is deployed and holds the provider's secrets, via a new
  `{ dryRun: true }` probe on that function that reports readiness without
  refreshing a token or calling any provider API

The Connect button stays disabled while any check fails. Warnings do not
block, because they cover things only confirmable *after* a connection
exists. A check that cannot be performed honestly reports `skipped`, never
`pass` — a green tick meaning "we didn't look" is worse than no tick.

**No secret is ever collected by the app.** Setup steps name what to set
and where (Supabase provider config, Edge Function secrets) and supply the
values the app can derive — the Supabase `/auth/v1/callback` redirect URL
and the scope strings. The client secret itself is entered by Aman
directly into Supabase, consistent with ADR 0007. A test asserts that no
step flagged `secret` carries anything resembling a value.

**Implement Microsoft/Teams sync for real.** `calendar-sync` now refreshes
Microsoft tokens against `login.microsoftonline.com` and reads events from
Microsoft Graph's `/me/calendarView`, extracting the Teams join URL from
`onlineMeeting.joinUrl` (falling back to `onlineMeetingUrl`). Both
providers are normalized to one row shape before the upsert, so nothing
downstream has to care which one an event came from.

## Consequences

- The Teams card is no longer a dead "Soon" — it connects, and syncs, once
  an Azure AD app registration exists and its secrets are set. Getting
  that registration is still Aman's to do; the card now states exactly
  what it needs instead of just refusing.
- Two Graph-specific gotchas are handled explicitly, both of which
  silently corrupt data rather than erroring: Graph returns times with the
  zone in a *separate field* rather than an offset in the string (so a
  naive `new Date()` reads UTC as local — the `Prefer: outlook.timezone`
  header plus an explicit `Z` fixes it), and Microsoft drops
  `offline_access` on refresh unless it is re-requested every time, which
  would otherwise make each refresh the last one that ever works.
- `calendar-sync` gains a `dryRun` branch. It still requires a valid JWT —
  it reveals which integrations a project has configured, so it is not
  public.
- **Not verified on real infrastructure.** The Microsoft path has never
  run: no Azure AD app registration exists yet, so no token refresh and no
  Graph call in this change has been executed against Microsoft. The
  microphone changes have not run on a real device either. What *is*
  verified: 64 unit tests over the pure logic, and a TypeScript
  differential showing no new error classes (the sandbox cannot
  `npm install`, so a full `tsc` run is dominated by unresolvable-import
  noise — see docs/testing.md).
- Follow-up if Teams is pursued: `calendar-sync` fetches only the primary
  calendar for Google and only the default calendar view for Microsoft;
  neither paginates past the first 50 events in a 14-day window.
