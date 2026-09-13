# ADR 0012: Meeting reminders and the in-app notification center

## Status
Accepted

## Context
Three related asks: (1) a push notification 15 minutes before a synced
meeting, (2) a "Day for me" dashboard card showing today's top two
meetings with a "View" link to the full list, (3) a notification bell in
the dashboard's top-right corner with an unread count and a preview list.

The user chose true push notifications over in-app-only reminders — they
should arrive even if MyNotes isn't open in a browser tab.

## Decision

### Delivery: Web Push (VAPID), not a third-party push service
Standard browser Web Push: a VAPID key pair identifies this app to the
push services (Google's FCM endpoint for Chrome, Mozilla's for Firefox,
etc. — the browser picks the endpoint, MyNotes never talks to FCM/APNs
directly). The service worker (already present for the PWA) gets a push
event handler that shows a `Notification` when a push arrives — this
needs the PWA's service worker build to move from vite-plugin-pwa's
default generated worker to `injectManifest` mode so custom push-handling
code can ship alongside the generated precache manifest.

The browser's Push subscription (`endpoint` + `p256dh` + `auth` keys) is
stored per-device in the new `push_subscriptions` table.

### Scheduling: a cron-triggered edge function, not a long-running server
Supabase supports scheduled edge functions via `pg_cron` +
`pg_net` (Database → Cron in the dashboard, or a
`select cron.schedule(...)` call). A new `remind` function (added with
the notification feature, not in this schema-only step) runs every
minute, selects `calendar_events` starting in the next 15 minutes with
`reminder_sent_at is null`, sends a Web Push to every subscription for
that user, writes a row to `notifications`, and stamps
`reminder_sent_at` so it never double-fires.

### The in-app notification center reads the same `notifications` table
The bell icon queries `notifications where user_id = auth.uid() order by
created_at desc`, badges the count where `read_at is null`, and a click
marks them read. This means the push-notification path and the "preview
all notifications" bell are the same data, not two separate systems.

### "Day for me" card
A plain client-side query against `calendar_events` for
`start_at between today_start and today_end order by start_at limit 2`
— no new table needed. "View" opens a detail page listing every event for
today (still `calendar_events`, unfiltered by the limit).

### What the user has to set up
A VAPID key pair is generated locally (no external account — it's just an
asymmetric key pair, not a third-party credential). Claude will generate
it and share the **public** key openly (it's meant to be embedded in
client code), but the **private** key — like every other secret this
session — gets typed into Supabase's Edge Function secrets page by the
user directly, not entered by Claude.

## Consequences
- New tables: `push_subscriptions`, `notifications` (this migration).
- PWA service worker moves to `injectManifest` mode — a real change to
  `vite-plugin-pwa` config, done as part of the notifications branch.
- Requires enabling `pg_cron`/`pg_net` extensions and scheduling the
  `remind` function in the Supabase dashboard — a one-time setup step,
  same "Claude drives the dashboard, user approves/enters secrets"
  pattern as the rest of this project.
