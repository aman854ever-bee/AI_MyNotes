# MyNotes

A personal AI-assisted note-taking and meeting-assistant app: capture text notes, voice notes and meetings, get an AI-structured summary with decisions and action items, and turn any of it into a task or reminder — built for daily use.

Built from `AI_Work_Companion_PRD.md`. See `docs/decisions/` for the calls made before development started, and the published Development Readiness Assessment for the full technical rationale.

## Status

**Phase 0 — Foundation.** `apps/web` is a scaffolded PWA shell. Nothing is wired to a live Supabase project yet — that's the first thing to do below.

## Getting started

```
cd apps/web
npm install
cp .env.example .env
```

Then:
1. Create a free project at [supabase.com](https://supabase.com).
2. In its SQL editor, run `infra/supabase/migrations/0001_init.sql`.
3. Copy the project's URL and anon key into `apps/web/.env`.
4. `npm run dev`

## Repository layout

```
apps/web/            React + TypeScript + Vite PWA — the app itself
infra/supabase/       SQL migrations and RLS policies
docs/decisions/        One short ADR per architectural decision
packages/shared-types/ Shared TypeScript types (wired in from Phase 1 onward)
services/               Placeholder for server-side logic beyond Supabase's built-ins
```

## Roadmap

Phase 0 Foundation (this) → Phase 1 Notes → Phase 2 Voice notes → Phase 3 Meeting recorder → Phase 4 AI analysis → Phase 5 Tasks & reminders → Phase 6 Sharing & search → Phase 7 Native shell (conditional, if the PWA proves the concept)
