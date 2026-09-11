import { supabase, isSupabaseConfigured } from './supabaseClient'
import { getVoiceNote, updateVoiceNote, getMeeting, updateMeeting } from './db'
import { uploadAudio, getSignedAudioUrl, audioPathFor } from './storage'

// Uploads the recording to Storage (if it isn't already up there), then
// sends the transcribe Edge Function a short-lived signed URL rather than
// the raw bytes — Deepgram fetches the audio itself from that URL, which
// scales to long meeting recordings without piping large bodies through
// the function (see docs/decisions — Phase 3 upload strategy). The
// function holds the real Deepgram key server-side; the browser never
// sees it (ADR 0007). Silently no-ops when Supabase isn't configured yet —
// the recording stays saved locally either way and this gets retried the
// next time the note opens.

export async function requestTranscription(voiceNoteId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const voiceNote = await getVoiceNote(voiceNoteId)
  if (!voiceNote) return
  if (voiceNote.status === 'transcribing' || voiceNote.status === 'ready') return

  await updateVoiceNote(voiceNoteId, { status: 'transcribing' })

  try {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) throw new Error('Not signed in')

    let path = voiceNote.storagePath
    if (!path) {
      if (!voiceNote.audioBlob) throw new Error('No local audio to upload')
      path = audioPathFor('voice-notes', userId, voiceNoteId, voiceNote.audioBlob.type)
      await uploadAudio(path, voiceNote.audioBlob)
      await updateVoiceNote(voiceNoteId, { storagePath: path, audioDirty: 0 })
    }

    const url = await getSignedAudioUrl(path)
    const { data, error } = await supabase.functions.invoke<{ transcript?: string; error?: string }>(
      'transcribe',
      { body: { url } },
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

// Same flow as requestTranscription, for meetings — a separate function
// rather than a generic one because the two local tables (and their
// status enums) aren't quite the same shape.
export async function requestMeetingTranscription(meetingId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const meeting = await getMeeting(meetingId)
  if (!meeting) return
  if (meeting.status === 'transcribing' || meeting.status === 'ready') return

  await updateMeeting(meetingId, { status: 'transcribing' })

  try {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) throw new Error('Not signed in')

    let path = meeting.storagePath
    if (!path) {
      if (!meeting.audioBlob) throw new Error('No local audio to upload')
      path = audioPathFor('meetings', userId, meetingId, meeting.audioBlob.type)
      await uploadAudio(path, meeting.audioBlob)
      await updateMeeting(meetingId, { storagePath: path, audioDirty: 0 })
    }

    const url = await getSignedAudioUrl(path)
    const { data, error } = await supabase.functions.invoke<{ transcript?: string; error?: string }>(
      'transcribe',
      { body: { url } },
    )

    if (error || !data?.transcript) {
      console.error('[mynotes] meeting transcription failed', error ?? data?.error)
      await updateMeeting(meetingId, { status: 'failed' })
      return
    }

    await updateMeeting(meetingId, { transcript: data.transcript, status: 'ready' })
  } catch (err) {
    console.error('[mynotes] meeting transcription failed', err)
    await updateMeeting(meetingId, { status: 'failed' })
  }
}
