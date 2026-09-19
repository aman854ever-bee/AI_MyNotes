-- Calendar sync preferences (ADR 0016). Additive only, safe to re-run.
--
-- Before this, everything about *how* sync behaves was hardcoded: a
-- 14-day window baked into both the edge function and the client, Google's
-- `primary` calendar only, Microsoft's default calendar view only, and no
-- automatic sync at all — events appeared only when someone pressed "Sync
-- now". That last one is why the app's own promise ("meetings show up
-- automatically") wasn't true.
--
-- Per the project's standing note: run this in the Supabase dashboard SQL
-- editor. `supabase db push` silently no-ops on this repo because the CLI
-- looks in supabase/migrations, not infra/supabase/migrations.

-- One row per user. Created on demand by the app; every column has a
-- default so a missing row behaves exactly like the old hardcoded values.
create table if not exists calendar_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Whether the client syncs on its own. Off means manual "Sync now"
  -- only, i.e. the previous behavior, kept reachable on purpose.
  auto_sync boolean not null default true,

  -- How often the client may trigger a sync, in minutes. Bounded rather
  -- than free-form: anything under a few minutes just burns provider API
  -- quota for a calendar that rarely changes that fast.
  sync_interval_minutes integer not null default 30
    check (sync_interval_minutes between 5 and 1440),

  -- How far ahead to pull events. Bounded because the providers page
  -- their results and this code does not follow pages yet — a huge window
  -- would silently return a truncated set rather than failing.
  sync_window_days integer not null default 14
    check (sync_window_days between 1 and 60),

  updated_at timestamptz not null default now()
);

alter table calendar_preferences enable row level security;

-- Each user sees and edits only their own row. Written as four separate
-- policies rather than `for all` so the intent of each is explicit, and
-- guarded with `if not exists` because this repo's earlier migrations
-- have been re-run by hand more than once.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'calendar_preferences' and policyname = 'calendar_preferences_select_own') then
    create policy calendar_preferences_select_own on calendar_preferences
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'calendar_preferences' and policyname = 'calendar_preferences_insert_own') then
    create policy calendar_preferences_insert_own on calendar_preferences
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'calendar_preferences' and policyname = 'calendar_preferences_update_own') then
    create policy calendar_preferences_update_own on calendar_preferences
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'calendar_preferences' and policyname = 'calendar_preferences_delete_own') then
    create policy calendar_preferences_delete_own on calendar_preferences
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Which calendar to actually read, per connected account.
--
-- null keeps the previous behavior (Google's `primary`, Microsoft's
-- default calendar view), so existing rows need no backfill. Set it when
-- the meetings that matter live on a secondary calendar — previously
-- those were simply invisible with no indication anything was missing.
alter table calendar_accounts
  add column if not exists calendar_id text,
  add column if not exists calendar_name text;

-- Microsoft tenant, per account.
--
-- Not a secret — it's the directory the app registration lives in. It was
-- only settable as an Edge Function secret defaulting to "common", which
-- fails outright for a single-tenant Entra registration and gave no way
-- to correct it from the app. The function falls back to the env var when
-- this is null, so nothing changes for existing setups.
alter table calendar_accounts
  add column if not exists oauth_tenant text;
