-- Calendar integration + notifications (ADR 0011, ADR 0012).
-- Run in the Supabase SQL editor (or `supabase db push`) after 0001-0004.

-- One row per user per connected calendar provider. refresh_token is the
-- long-lived OAuth refresh token captured right after
-- supabase.auth.linkIdentity() completes — see ADR 0011 for why this is
-- stored plainly under RLS rather than in Vault (not done yet).
create table if not exists calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  provider_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- Synced calendar events (meeting invites). Keyed on the external
-- provider's own event id so a re-sync upserts instead of duplicating.
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_account_id uuid not null references calendar_accounts(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  external_id text not null,
  title text not null default 'Untitled meeting',
  start_at timestamptz not null,
  end_at timestamptz,
  join_url text,
  organizer_name text,
  location text,
  is_cancelled boolean not null default false,
  reminder_sent_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (calendar_account_id, external_id)
);
create index if not exists calendar_events_user_start_idx on calendar_events (user_id, start_at);

-- One row per subscribed browser/device (a user may have several).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

-- Backs both the push-reminder history and the in-app notification bell —
-- the "remind" edge function (ADR 0012) writes a row here every time it
-- sends a push, and the bell just reads this table.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'meeting_reminder',
  title text not null,
  body text,
  calendar_event_id uuid references calendar_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);

alter table calendar_accounts enable row level security;
alter table calendar_events enable row level security;
alter table push_subscriptions enable row level security;
alter table notifications enable row level security;

create policy "own rows" on calendar_accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on calendar_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
