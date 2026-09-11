-- Phase 2 (Voice notes): voice_notes had no updated_at, so the client
-- couldn't do the same last-write-wins comparison it already does for
-- notes. Add it, defaulting existing rows to created_at.

alter table voice_notes add column if not exists updated_at timestamptz not null default now();

update voice_notes set updated_at = created_at where updated_at is null;
