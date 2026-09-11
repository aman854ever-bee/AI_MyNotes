import { supabase } from './supabaseClient'

// Shared by voice notes and meetings. Objects are private (see migration
// 0003_audio_storage.sql) — the app always asks for a short-lived signed
// URL rather than assuming public access.

const BUCKET = 'audio'

export async function uploadAudio(path: string, blob: Blob): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'audio/webm',
    upsert: true,
  })
  if (error) throw error
}

export async function getSignedAudioUrl(path: string, expiresInSeconds = 300): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error || !data) throw error ?? new Error('Could not create a signed URL')
  return data.signedUrl
}

export function audioPathFor(kind: 'voice-notes' | 'meetings', userId: string, id: string, mimeType: string): string {
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm'
  return `${userId}/${kind}/${id}.${ext}`
}
