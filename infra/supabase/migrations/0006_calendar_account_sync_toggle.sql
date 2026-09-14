-- Per-account sync toggle + last-synced timestamp (piece 5, Connect page
-- rebuild). Additive only, safe to run more than once.
--
-- sync_enabled: lets someone pause syncing for one connected provider
-- without disconnecting it (loses the stored refresh token) — most useful
-- once a second provider (Microsoft/Teams, piece 6) is also connected.
-- calendar-sync skips any account with sync_enabled = false.
--
-- last_synced_at: set on calendar_accounts itself (not derived from
-- calendar_events) so the Connect page can show "last synced" even on a
-- sync that found zero events, distinct from "never synced".
alter table calendar_accounts
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists last_synced_at timestamptz;
