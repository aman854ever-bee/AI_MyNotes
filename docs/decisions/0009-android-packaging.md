# 0009: Android packaging via Capacitor

**Status:** Accepted
**Date:** 2026-09-11

## Context

Aman asked for an installable `.apk` to test MyNotes on an Android phone,
and separately to be able to open and run the app in a browser himself.

MyNotes has been a PWA since Phase 0 (`vite-plugin-pwa`, a web manifest,
a service worker). Three ways exist to get something installable on
Android from that:

1. **Plain PWA install** ("Add to Home Screen" from Chrome). Free, but
   needs the app served over HTTPS (or `localhost`) for Chrome to treat
   it as a real installable PWA — LAN `http://` doesn't qualify, so this
   only becomes available once the app is deployed somewhere with TLS.
2. **Trusted Web Activity** (Bubblewrap) — wraps a *publicly hosted*
   HTTPS PWA as a thin native shell. Same hosting requirement as (1),
   plus Digital Asset Links verification against that public domain.
3. **Capacitor** — copies the built web app (`dist/`) into a native
   Android project directly. No public hosting required; it packages
   whatever's in `dist/` as of the last `npx cap sync`, so it can be
   built and installed straight from a local machine.

## Decision

**Capacitor**, because it's the only option of the three that doesn't
first require deploying the app somewhere with a real TLS certificate —
which isn't set up yet and is a separate decision on its own. Capacitor
gives a real `.apk` buildable entirely from the existing local repo.

The web app itself is unchanged — same React/Vite/Dexie source, same
`dist/` build. Capacitor only adds a thin native wrapper (a WebView
pointed at the bundled `dist/` assets) plus whatever native plugins are
opted into later (camera/mic permissions, filesystem, etc. — none used
yet; the web `getUserMedia` API the app already uses works fine inside
Capacitor's WebView on modern Android).

## What was added

- `apps/web/capacitor.config.ts` — app id `com.aman.mynotes`, name
  `MyNotes`, `webDir: 'dist'`.
- `apps/web/android/` — the generated native Gradle project (standard
  Capacitor output, own `.gitignore` for build artifacts/`local.properties`).
- `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` added to
  `apps/web/package.json`.

## What this does NOT do yet

- **No actual `.apk` was produced by Claude.** Compiling the Android
  project needs the Android SDK + Gradle, which in turn need to reach
  Google's Maven repo (`dl.google.com`) and Maven Central — both blocked
  by org network policy in the cloud sandbox *and* in the device-bridge
  VM Claude used to scaffold this. The scaffold above is everything that
  doesn't need that network access; the actual build has to run
  somewhere with normal internet access — see `docs/android-build.md`
  for exact steps on Aman's own machine (outside any Claude sandbox).
- **No app icon customization** — ships with Capacitor's default
  placeholder launcher icon. Cosmetic, safe to defer.
- **Unsigned debug build only** for now — fine for installing on one's
  own phone via USB/file transfer; a signed release build (for the Play
  Store or wider distribution) is a separate, later step with its own
  keystore-management concerns.

## Consequences

Every future phase's `apps/web/dist` output can become the Android build
just by running `npx cap sync android` before opening Android Studio —
no separate native codebase to keep in sync by hand.
