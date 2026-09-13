import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Null until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set in .env —
// every caller must handle the unconfigured case rather than assume a client exists.
//
// flowType: 'pkce' (spike/capacitor-oauth) — needed for the Android OAuth
// redirect fix in lib/capacitorAuth.ts. PKCE returns a `code` in the final
// redirect URL instead of implicit-flow's raw access/refresh tokens, which
// is both Supabase's documented recommendation for native apps (tokens
// never sit exposed in a URL/Android Intent) and what makes
// `exchangeCodeForSession()` available to complete the deep-link callback.
// No behavior change for the existing web flow — PKCE works there too.
export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, { auth: { flowType: 'pkce' } })
  : null
