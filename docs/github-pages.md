# Publishing MyNotes to GitHub Pages (installable PWA over HTTPS)

This repo has no GitHub remote yet — you chose to add one specifically to
get an HTTPS URL Chrome will let you install as an app. Everything on
Claude's side is ready (`.github/workflows/deploy-pages.yml` builds
`apps/web` and publishes it automatically on every push to `master`); the
steps below are the ones only you can do, from a normal terminal/browser —
not through the Claude session, since GitHub Pages itself isn't reachable
from any sandbox Claude has here.

## One-time setup

1. **Create an empty repo on GitHub** (github.com → New repository). Public
   — GitHub Pages needs that unless your plan supports Pages on private
   repos. Don't initialize it with a README/license (this repo already has
   history to push).
2. **Connect it and push**, in a normal terminal:
   ```
   cd "D:\AI - Projects\My Notes"
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin master
   ```
   (First push may prompt you to sign in to GitHub in a browser — normal.)
3. **Turn on Pages**: on GitHub, go to the repo's **Settings → Pages**, and
   under "Build and deployment" set **Source: GitHub Actions**. That's the
   only manual toggle — the workflow file handles the rest from here on.
4. Go to the **Actions** tab and watch the "Deploy to GitHub Pages" run
   finish (~1–2 minutes). When it's green, your app is live at:
   ```
   https://<your-username>.github.io/<repo-name>/
   ```

## After that

- **Every future `git push` to `master`** rebuilds and redeploys
  automatically — no repeat steps.
- **On your Android phone**: open that URL in Chrome, then use the menu →
  "Add to Home screen" / "Install app". It installs like a native app
  (own icon, standalone window, works offline for the shell) — this is
  the thing the APK path was trying to get you to, without the Android
  Studio detour.
- **Backend features** (transcription, AI analysis) still need the
  provisioning checklist in the project status doc. Once you've created
  the Supabase/Deepgram/Anthropic keys, add `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` as **repo secrets** (Settings → Secrets and
  variables → Actions → New repository secret) and push again — the
  workflow already reads those two. Everything else (Deepgram/Anthropic
  keys) stays server-side in Supabase, never in this repo or the deployed
  site, same as always.
- **Making the repo public exposes your source code** (components, edge
  function code, SQL migrations) — not your `.env` file, not any API key,
  since none of those are committed. If that's a concern later, moving to
  a private repo (with a Pages-supporting plan) or a different host is a
  config change, not a rewrite.
