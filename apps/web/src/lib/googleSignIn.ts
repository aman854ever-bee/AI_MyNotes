import { supabase } from './supabaseClient'
import { isNativePlatform, oauthRedirectTo, openOAuthUrl } from './capacitorAuth'

/**
 * Primary "Continue with Google" sign-in (engineering plan piece 4).
 *
 * Distinct from calendar.ts's connectCalendar(), which uses linkIdentity()
 * to *add* Google Calendar access to an already-signed-in session and asks
 * for the calendar.readonly scope. This is a plain sign-in/sign-up — no
 * calendar scope requested here, just the default profile/email grant
 * Google returns automatically. Reuses the same Google Cloud OAuth app
 * already registered for Calendar (piece 5) — nothing new to configure
 * there.
 *
 * Same web/native redirect handling as connectCalendar() (see
 * capacitorAuth.ts for why): on native, skip the automatic redirect and
 * open the consent URL in a Custom Tab instead of the embedded WebView,
 * then let the appUrlOpen deep-link listener registered in App.tsx
 * complete the session.
 */
export async function signInWithGoogle(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }
  const native = isNativePlatform()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: oauthRedirectTo(),
      skipBrowserRedirect: native,
    },
  })
  if (error) return { ok: false, message: error.message }
  if (native && data?.url) {
    await openOAuthUrl(data.url)
  }
  return { ok: true } // browser navigates away before this resolves (web), or the Custom Tab takes over (native)
}
