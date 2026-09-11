-- MyNotes initial schema
-- Run this in your Supabase project's SQL editor (or via `supabase db push`).
-- Every table is scoped to auth.uid() through Row Level Security below —
-- this is the technical guarantee behind "must never expose one user's data to another".

create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists note_tags (
  note_id uuid not null references notes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

create table if not exists voice_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  storage_path text,
  duration_seconds integer,
  transcript text,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  agenda text,
  status text not null default 'not_started'
    check (status in ('not_started','recording','paused','stopped','processing','transcribing','analyzing','ready','failed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists meeting_participants (
  meeting_id uuid not null references meetings(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  primary key (meeting_id, participant_id)
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  storage_path text,
  duration_seconds integer,
  upload_status text not null default 'pending'
    check (upload_status in ('pending','uploading','uploaded','failed')),
  created_at timestamptz not null default now()
);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  provider text,
  raw_text text,
  created_at timestamptz not null default now()
);

create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references transcripts(id) on delete cascade,
  speaker_label text,
  start_ms integer not null,
  end_ms integer not null,
  text text not null
);

-- Nothing the AI produces is a fact until the user approves it (PRD Section 19).
-- The UI writes suggestions here; only an explicit "Create" moves one into
-- decisions / action_items / reminders below.
create table if not exists ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  kind text not null check (kind in ('summary','decision','action','reminder')),
  payload jsonb not null,
  confidence text check (confidence in ('high','medium','low')),
  status text not null default 'pending' check (status in ('pending','approved','ignored')),
  created_at timestamptz not null default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  context text,
  timestamp_ms integer,
  created_from_suggestion_id uuid references ai_suggestions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade,
  title text not null,
  owner text,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed','cancelled')),
  source_timestamp_ms integer,
  confidence text check (confidence in ('high','medium','low')),
  created_from_suggestion_id uuid references ai_suggestions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  owner text,
  due_date date,
  priority text check (priority in ('low','medium','high')),
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed','cancelled')),
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  remind_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','sent','snoozed','done','cancelled')),
  channel text not null default 'push' check (channel in ('push','email')),
  created_at timestamptz not null default now()
);

-- Row Level Security -----------------------------------------------------

alter table projects enable row level security;
alter table tags enable row level security;
alter table notes enable row level security;
alter table note_tags enable row level security;
alter table voice_notes enable row level security;
alter table participants enable row level security;
alter table meetings enable row level security;
alter table meeting_participants enable row level security;
alter table recordings enable row level security;
alter table transcripts enable row level security;
alter table transcript_segments enable row level security;
alter table ai_suggestions enable row level security;
alter table decisions enable row level security;
alter table action_items enable row level security;
alter table tasks enable row level security;
alter table reminders enable row level security;

-- Direct-owner tables: simple "own rows only".
create policy "own rows" on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on tags for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on voice_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on participants for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on meetings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child tables: ownership flows through the parent meeting/transcript/note.
create policy "own via meeting" on recordings for all
  using (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()));

create policy "own via meeting" on transcripts for all
  using (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()));

create policy "own via transcript" on transcript_segments for all
  using (exists (select 1 from transcripts t join meetings m on m.id = t.meeting_id where t.id = transcript_id and m.user_id = auth.uid()))
  with check (exists (select 1 from transcripts t join meetings m on m.id = t.meeting_id where t.id = transcript_id and m.user_id = auth.uid()));

create policy "own via meeting" on ai_suggestions for all
  using (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()));

create policy "own via meeting" on decisions for all
  using (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()));

create policy "own via meeting" on action_items for all
  using (meeting_id is null or exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()))
  with check (meeting_id is null or exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()));

create policy "own via note" on note_tags for all
  using (exists (select 1 from notes n where n.id = note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from notes n where n.id = note_id and n.user_id = auth.uid()));

create policy "own via meeting" on meeting_participants for all
  using (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meetings m where m.id = meeting_id and m.user_id = auth.uid()));
