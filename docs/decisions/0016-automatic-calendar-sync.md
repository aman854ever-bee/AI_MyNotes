# ADR 0016: Make calendar sync automatic, and configurable

Date: 2026-09-19 · Status: Accepted

## Context

ADR 0015 added setup validation — the app could tell you whether a
provider was correctly configured. It did not change what happened after
that, and what happened after that was: nothing, until you pressed a
button.

Everything about sync behavior was hardcoded:

- **No automatic sync at all.** `syncCalendars()` ran only from the "Sync
  now" button. The Connect screen's own subtitle says "Connect a calendar
  so meetings show up automatically", which simply wasn't true.
- **14-day window**, baked into both `calendar-sync` and `calendar.ts` —
  two copies that could drift apart silently.
- **Google's `primary` calendar only.** Meetings on a secondary calendar
  were invisible, with nothing indicating anything was missing.
- **Microsoft's default calendar view only**, and the tenant settable only
  as an Edge Function secret defaulting to `common` — which fails outright
  for a single-tenant Entra registration, with no way to correct it from
  the app.

## Decision

**Sync automatically while the app is open**, on a user-chosen interval,
with the decision logic in `lib/syncSchedule.ts` — pure and unit tested,
because both failure modes are quiet: too eager burns provider quota and
Edge Function invocations on every mount, too lazy means the app's central
promise stays false. The rules:

- sync immediately when an account has never synced (so a freshly
  connected calendar populates without hunting for a button)
- otherwise wait for the user's interval since the last *successful* sync
- never retry within 60s of any *attempt*, successful or not, so a
  provider outage can't turn every mount into another failed round-trip
- re-check on `visibilitychange`, since timers are throttled in background
  tabs and returning to the app is exactly when stale events show

The skip decision returns a *reason*, which the Connect screen displays —
"why hasn't this synced?" is answerable without reading logs.

**Store preferences per user** (migration 0007): `auto_sync`,
`sync_interval_minutes` (5–1440), `sync_window_days` (1–60), with CHECK
constraints and RLS. Per-account: `calendar_id` / `calendar_name` for
calendar selection, and `oauth_tenant` for Microsoft. Every column has a
default matching the old hardcoded value, so a missing row behaves exactly
as before and no backfill is needed.

**Clamp on read as well as in the database.** `normalizeSyncPreferences`
bounds whatever comes back before it is acted on. This is not redundant
with the CHECK constraints: values can predate them, arrive as strings
from a `<select>`, or come from a project where 0007 hasn't been applied.
A test caught a real bug here — `Number(null)` is `0`, which is finite, so
an early version clamped a null interval to the *minimum* (5 minutes)
rather than falling back to the default (30), quietly syncing six times
more often than intended.

**Degrade rather than fail when 0007 is missing.** `calendar-sync` selects
the new columns, and on a `42703`/`42P01` retries with the old column
list. On this repo migrations are applied by hand in the dashboard SQL
editor (`supabase db push` silently no-ops — see the project status doc),
so "one migration behind" is a realistic state. Without the fallback, a
deploy would stop syncing entirely rather than just losing the new options.

**Add a `listCalendars` action** to `calendar-sync`, server-side for the
same reason the sync is: listing calendars needs a fresh access token, and
refreshing one needs the client secret (ADR 0011).

**Offer interval and window as fixed choices, not free number inputs.**
Both have real bounds, and a select can't express a value that then gets
clamped away behind the user's back.

## Consequences

- **This is not a background job.** Sync happens while the app is open;
  nothing runs when it's closed. Doing that properly needs a scheduled
  server-side invocation — pg_cron, or a Supabase scheduled function —
  which is separate work and real infrastructure. The UI says so plainly
  rather than implying otherwise.
- Neither provider fetch follows pagination, so the window is capped at 60
  days and still returns at most 50 events. A larger window would silently
  truncate rather than fail, which is why the cap exists at all.
- `last_synced_at` is read from the server rather than local state, so a
  sync from another device correctly suppresses a redundant one here.
- The "Upcoming / Next N days" label and the event query now both follow
  the configured window. Previously a 30-day sync would have fetched 30
  days and displayed 14, with the label still claiming 14.
- **Not verified against real infrastructure.** Migration 0007 has not
  been applied, `listCalendars` has never been called, and the Microsoft
  path still has no Azure AD registration behind it. What is verified: 80
  unit tests, the new pure module typechecking clean under `--strict`, and
  a `tsc` differential showing no new error classes.
