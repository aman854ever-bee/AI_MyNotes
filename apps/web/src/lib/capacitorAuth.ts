// Fixes the OAuth redirect risk flagged in the engineering plan (piece 1,
// spike/capacitor-oauth): connectCalendar() used to redirect the browser
// with plain window.location navigation, staying inside Capacitor's
// embedded WebView the whole time. Two real problems with that on Android:
//
// 1. Google's OAuth policy actively detects and blocks sign-in attempts
//    from an embedded WebView user-agent ("This browser or app may not be
//    secure") — the flow can fail before a redirect even matters.
// 2. Capacitor serves the app from a virtual origin (https://localhost),
//    not a real internet host, so `redirectTo: window.location.origin`
//    is meaningless outside that WebView.
//
// The fix: open the OAuth URL in a real Chrome Custom Tab (@capacitor/browser)
// instead of the WebView — Google explicitly allows this — and redirect back
// via a custom URL scheme deep link instead of a web origin. Android hands
// the deep link to the app as an `appUrlOpen` event (registered below),
// which is how the app resumes after the OAuth round-trip.
//
// NOT YET VERIFIED ON A REAL DEVICE — see docs/decisions/0014-capacitor-oauth-spike.md
// for what this fixes, what's still unconfirmed, and the exact next step.

import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { App as CapacitorApp } from '@capacitor/app'
import { supabase } from './supabaseClient'

/** Custom URL scheme this app registers for the OAuth deep-link callback.
 *  Must also be added to Supabase Dashboard -> Authentication -> URL
 *  Configuration -> Redirect URLs (public config, not a secret) and to
 *  AndroidManifest.xml's intent-filter (see android/.../AndroidManifest.xml). */
const OAUTH_CALLBACK_URL = 'mynotes://oauth-callback'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/** Where the OAuth provider (via Supabase's own callback) should send the
 *  browser back to once sign-in completes. */
export function oauthRedirectTo(): string {
  return isNativePlatform() ? OAUTH_CALLBACK_URL : window.location.origin + window.location.pathname
}

/** Opens the OAuth consent URL. On native, uses a Custom Tab (not the
 *  embedded WebView) so Google/Microsoft don't block it as an embedded
 *  user-agent. On web this is unused — supabase-js redirects the browser
 *  itself when skipBrowserRedirect isn't set. */
export async function openOAuthUrl(url: string): Promise<void> {
  if (isNativePlatform()) {
    await Browser.open({ url })
  } else {
    window.location.assign(url)
  }
}

/** Call once, high up in the app (App.tsx), on mount. Native-only — the web
 *  build never fires appUrlOpen. Completes the PKCE flow from the deep-link
 *  callback URL Android hands back after the Custom Tab closes. */
export function registerOAuthDeepLinkListener(): void {
  if (!isNativePlatform() || !supabase) return
  // Captured in a local const so the null-check above narrows inside the
  // closure below — TS doesn't carry that narrowing through a module-scope
  // imported binding into a nested async callback.
  const client = supabase

  void CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(OAUTH_CALLBACK_URL)) return // not our callback — ignore

    await Browser.close().catch(() => {
      // Already closed by the OS in some flows — not an error.
    })

    const { error } = await client.auth.exchangeCodeForSession(url)
    if (error) {
      // Surfaced to the user via the normal onAuthStateChange-driven UI
      // (session stays null); logged here for whoever's watching device
      // logs during the spike verification pass.
      console.error('[capacitorAuth] exchangeCodeForSession failed', error)
    }
    // On success, supabase-js's own onAuthStateChange fires with the new
    // session — App.tsx's existing listener (captureLinkedCalendarTokens)
    // picks it up the same way the web flow already does.
  })
}
