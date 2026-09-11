import { supabase, isSupabaseConfigured } from './supabaseClient'
import { getVoiceNote, updateVoiceNote } from './db'

// Sends the recording straight to the `transcribe` Edge Function — no
// intermediate Storage upload in this phase (see ADR 0007). The function
// holds the real Deepgram key server-side; the browser never sees it.
// Silently no-ops when Supabase isn't configured yet — the recording stays
// saved locally either way and this gets retried the next time the note opens.

export async function requestTranscription(voiceNoteId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const voiceNote = await getVoiceNote(voiceNoteId)
  if (!voiceNote || !voiceNote.audioBlob) return
  if (voiceNote.status === 'transcribing' || voiceNote.status === 'ready') return

  await updateVoiceNote(voiceNoteId, { status: 'transcribing' })

  try {
    const { data, error } = await supabase.functions.invoke<{ transcript?: string; error?: string }>(
      'transcribe',
      { body: voiceNote.audioBlob },
    )

    if (error || !data?.transcript) {
      console.error('[mynotes] transcription failed', error ?? data?.error)
      await updateVoiceNote(voiceNoteId, { status: 'error' })
      return
    }

    await updateVoiceNote(voiceNoteId, { transcript: data.transcript, status: 'ready' })
  } catch (err) {
    console.error('[mynotes] transcription failed', err)
    await updateVoiceNote(voiceNoteId, { status: 'error' })
  }
}
