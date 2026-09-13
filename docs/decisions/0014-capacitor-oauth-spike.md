# ADR 0014: Capacitor/Android OAuth redirect — spike findings and fix

Date: 2026-09-13 · Status: Proposed (code written, NOT yet verified on a real device)

## Context
Piece 1 of the engineering plan (see the plan artifact linked from
`mynotes/00-status-and-decisions.md` in the project) flagged a risk before
building Google sign-in, mobile OTP, or the Teams/Gmail connect UI on top
of it: `connectCalendar()` (added on `feature/google-calendar-connect`,
not yet merged) kicks off Google/Microsoft calendar linking via
`supabase.auth.linkIdentity()`, which redirects the browser with a plain
`redirectTo: window.location.origin + window.location.pathname`. That
assumes a normal web browser tab. Capacitor's Android build doesn't give
you one by default — the app runs inside an embedded WebView serving a
virtual `https://localhost` origin, not a real internet host.

## What was actually found (reading the code, not guessing)
Two distinct problems, not one:

1. **Google blocks embedded WebViews for OAuth outright.** This isn't
   theoretical — it's a documented Google policy: sign-in attempts from an
   embedded user-agent get a "This browser or app may not be secure"
   refusal, independent of whether the redirect URL is even reachable.
2. **The redirect target is meaningless outside the WebView.**
   `window.location.origin` inside Capacitor resolves to `https://localhost`
   by default — not a real host a browser or the OS can route back to.

Confirmed directly in the repo: no `@capacitor/browser` or `@capacitor/app`
dependency existed, `capacitor.config.ts` declares no custom URL scheme,
and `AndroidManifest.xml` had only the launcher intent-filter — nothing
built to handle a deep-link return. So the risk was real, not hypothetical.

## Decision
Fix applied on `spike/capacitor-oauth` (branched from
`feature/google-calendar-connect`, since that's where `connectCalendar()`
lives):

1. **Open the OAuth URL in a Chrome Custom Tab, not the WebView** —
   `@capacitor/browser`'s `Browser.open()`. Google explicitly allows this;
   it's the same escape hatch every native app uses.
2. **Redirect back via a custom URL scheme deep link, not a web origin** —
   `mynotes://oauth-callback`, registered in `AndroidManifest.xml` and
   handled by `@capacitor/app`'s `appUrlOpen` event
   (`lib/capacitorAuth.ts` -> `registerOAuthDeepLinkListener()`,
   called once from `App.tsx`).
3. **Switch the Supabase client to PKCE flow** (`flowType: 'pkce'` in
   `supabaseClient.ts`) — the deep-link callback carries a `code` query
   param that `supabase.auth.exchangeCodeForSession(url)` exchanges for a
   session, rather than implicit flow's raw tokens sitting in a URL
   fragment (which is also Supabase's own documented recommendation for
   native apps — tokens shouldn't sit exposed in an Android Intent).
4. **`connectCalendar()`** now branches on `Capacitor.isNativePlatform()`:
   unchanged on web (supabase-js redirects the browser itself); on native,
   `skipBrowserRedirect: true` so the OAuth URL comes back as data instead
   of an automatic WebView navigation, then `openOAuthUrl()` hands it to
   the Custom Tab.

## Consequences / what's still open
- **Not yet verified on a real device or emulator.** This environment
  can't build or run the Android app (no Deno/Android SDK on the bridge,
  and platform-mismatched `node_modules` from earlier in this project —
  see prior session notes). The code follows Capacitor's and Supabase's
  own documented patterns correctly, but "correctly written" and
  "confirmed working" are different claims — only the latter closes this
  spike.
- **Next step**: `npm install` (to actually pull in `@capacitor/app` and
  `@capacitor/browser`, only declared in `package.json` so far), rebuild
  the APK via the existing `build-android-apk.yml` GitHub Actions
  workflow, install it on Aman's phone, and click "Connect calendar" for
  real. This matches how the plan itself said this risk gets confirmed
  either way.
- **One manual config step required before that test can succeed**:
  `mynotes://oauth-callback` needs to be added to Supabase Dashboard ->
  Authentication -> URL Configuration -> Redirect URLs. This is public
  config, not a secret — Claude can add it directly once ready to test.
- No changes needed on Google Cloud / Azure's side — their authorized
  redirect URI is Supabase's own fixed callback
  (`https://rkracjeikisxrzmeemby.supabase.co/auth/v1/callback`), which
  was already set up correctly; the app-side custom scheme only matters
  for the final hop from Supabase back into the app.
