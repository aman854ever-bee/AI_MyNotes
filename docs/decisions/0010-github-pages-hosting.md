# 0010: Host MyNotes on GitHub Pages for HTTPS PWA install

**Status:** Accepted
**Date:** 2026-09-12

## Context

After ADR 0009 (Capacitor Android shell), Aman asked to proceed and
picked hosting the app for PWA install over the APK/build-it-yourself
path. That needs the app served over HTTPS somewhere public.

Checked reachability from every environment Claude has access to (the
cloud sandbox and the device-bridge VM): Vercel, Netlify, and Cloudflare
(API and asset domains alike) are all blocked by org network policy in
both. **GitHub** (`github.com`, `api.github.com`) is reachable from the
device bridge (allowlisted alongside npm/PyPI-type registries) — but
`*.github.io` itself is blocked too, meaning Claude can prepare a GitHub
Pages deploy but can't independently verify the live URL from a sandbox
shell (a device browser tool, which uses the user's real network, can).

This reopens decision 10-ish ground: the repo had no remote (a deliberate
earlier choice to skip GitHub for the local branch-per-phase SDLC). Asked
Aman directly since it involves making source public; he chose "yes, add
a public GitHub repo."

## Decision

**GitHub Pages, deployed via GitHub Actions**, triggered on push to
`master`. Rationale over the alternatives:
- Cloudflare/Netlify/Vercel: unreachable from any environment Claude has
  here, so Claude couldn't drive the setup at all beyond writing a guide
  for a service it can't test against.
- A manually-maintained `gh-pages` branch: works, but the Actions
  approach means every future phase's merge to `master` deploys with no
  extra step, matching how the repo already treats `master` as the
  source of truth.

## What was added

- `apps/web/vite.config.ts`: `base` now reads `VITE_BASE_PATH` (defaults
  to `/`, so `npm run dev`/`npm run build` locally are unaffected); the
  PWA manifest's `start_url`/`scope` changed from absolute `/` to
  relative `.` so the installed app resolves correctly whether served
  from the site root or a Pages subpath.
- `.github/workflows/deploy-pages.yml`: builds `apps/web` with
  `VITE_BASE_PATH` set to `/<repo-name>/` (via
  `${{ github.event.repository.name }}`, so it isn't hardcoded to
  whatever Aman names the repo) and publishes `dist/` via
  `actions/deploy-pages`. Also wired to read `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` from repo secrets if/when Aman sets them, so
  finishing the provisioning checklist later gets a fully working deploy
  for free rather than needing a second round of hosting changes.
- `docs/github-pages.md`: the one-time steps only Aman can do (create the
  repo, push, flip the Pages source toggle) — none of it reachable from a
  Claude-controlled sandbox, so it's written as manual instructions
  rather than something Claude ran.

## Consequences

- The repo's source becomes publicly visible on GitHub (not secrets —
  none are committed; `.env` stays gitignored, and Deepgram/Anthropic
  keys live only in Supabase secrets).
- Until Aman does the one-time GitHub setup, this workflow sits unused —
  no behavior change to the app itself, safe to have merged early.
