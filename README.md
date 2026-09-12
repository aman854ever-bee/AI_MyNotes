# MyNotes

A personal AI-assisted note-taking and meeting-assistant app: capture text notes, voice notes and meetings, get an AI-structured summary with decisions and action items, and turn any of it into a task or reminder — built for daily use.

Built from `AI_Work_Companion_PRD.md`. See `docs/decisions/` for the calls made along the way and the published Development Readiness Assessment for the full technical rationale (linked from the project status doc).

## Status

**Phases 0–4 done.** Notes, voice notes, meeting recording + transcription, and AI meeting analysis (summary/decisions/action items, individually approvable) are all built. Everything runs fully offline for capture and editing; transcription and AI analysis need Supabase + Deepgram + Anthropic provisioned (see below) — until then the app just runs in local-only mode.

Two more things are scaffolded but need a one-time manual step to finish:
- **Installable web app (GitHub Pages)** — workflow's in `.github/workflows/deploy-pages.yml`, needs a GitHub remote connected once. See `docs/github-pages.md`.
- **Android APK (Capacitor)** — native project's in `apps/web/android/`, needs Android Studio on a machine with normal internet to actually compile. See `docs/android-build.md`.

New here? Start with **"How to use MyNotes"** (linked from the project status doc) for a screen-by-screen walkthrough of what's actually built.

## Getting started

```
cd apps/web
npm install
cp .env.example .env
```

Then, to get transcription and AI analysis working (optional — notes and recording work without this):
1. Create a free project at [supabase.com](https://supabase.com).
2. In its SQL editor, run the migrations in `infra/supabase/migrations/` **in order**: `0001_init.sql`, `0002_voice_notes_updated_at.sql`, `0003_audio_storage.sql`, `0004_meetings_updated_at.sql`.
3. Copy the project's URL and anon key into `apps/web/.env`.
4. Install the Supabase CLI, `supabase link` to the project, then:
   - `supabase functions deploy transcribe` and `supabase secrets set DEEPGRAM_API_KEY=...`
   - `supabase functions deploy analyze` and `supabase secrets set ANTHROPIC_API_KEY=...`

Either way:
```
npm run dev
```
Open `http://localhost:5173`. (`npm run dev -- --host` to also reach it from a phone on the same WiFi — note that microphone access needs `localhost` or real HTTPS, so recording won't work over plain LAN `http://`.)

## Repository layout

```
apps/web/               React + TypeScript + Vite PWA — the app itself
apps/web/android/        Capacitor native Android project (generated, see docs/android-build.md)
infra/supabase/          SQL migrations and RLS policies
supabase/functions/      Edge functions (transcribe, analyze) — hold the Deepgram/Anthropic API keys server-side
.github/workflows/       GitHub Pages deploy (see docs/github-pages.md)
docs/decisions/          One short ADR per architectural decision
packages/shared-types/   Shared TypeScript types (wired in from Phase 1 onward)
services/                Placeholder for server-side logic beyond Supabase's built-ins
```

## Roadmap

Phase 0 Foundation → Phase 1 Notes → Phase 2 Voice notes → Phase 3 Meeting recorder → Phase 4 AI analysis — **all done**. Phase 5 (Tasks & reminders) and beyond aren't scoped yet.
