-- Same gap as voice_notes (0002): meetings only had created_at, so the
-- client couldn't tell whether a remote row had actually changed since the
-- last pull. Add updated_at, defaulting existing rows to created_at.

alter table meetings add column if not exists updated_at timestamptz not null default now();

update meetings set updated_at = created_at where updated_at is null;
