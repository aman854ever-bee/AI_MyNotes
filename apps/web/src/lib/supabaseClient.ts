import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Null until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set in .env —
// every caller must handle the unconfigured case rather than assume a client exists.
export const supabase = isSupabaseConfigured ? createClient(url as string, anonKey as string) : null
