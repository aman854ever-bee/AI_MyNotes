import { supabase, isSupabaseConfigured } from './supabaseClient'
import { db, type LocalNote, type LocalVoiceNote, type LocalMeeting } from './db'
import type { MeetingStatus } from '../types'

// Local-first, last-write-wins sync. Every note change already happened in
// IndexedDB (db.ts) before this ever runs — this module's only job is
// reconciling that with Supabase when there's a connection. No merge UI:
// the newer `updatedAt` wins. Fine for one person on (usually) one device
// at a time; revisit if same-minute cross-device edits become a real
// problem (PRD Section 35's "same note edited on two devices" scenario).

let syncing = false

export async function syncNow(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  if (syncing) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  syncing = true
  try {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return

    await pushDirtyNotes(userId)
    await pullRemoteNotes(userId)
    await pushDirtyVoiceNotes(userId)
    await pullRemoteVoiceNotes(userId)
    await pushDirtyMeetings(userId)
    await pullRemoteMeetings(userId)
  } catch (err) {
    console.error('[mynotes] sync failed', err)
  } finally {
    syncing = false
  }
}

async function pushDirtyNotes(userId: string): Promise<void> {
  if (!supabase) return
  const dirty = (await db.notes.toArray()).filter((n) => n.dirty === 1)

  for (const note of dirty) {
    if (note.deletedAt) {
      const { error } = await supabase.from('notes').delete().eq('id', note.id)
      if (error) continue
      await db.notes.delete(note.id)
      continue
    }

    const { error } = await supabase.from('notes').upsert({
      id: note.id,
      user_id: userId,
      project_id: note.projectId,
      title: note.title,
      content: note.content,
      tags: note.tags,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
    })
    if (!error) {
      await db.notes.update(note.id, { dirty: 0 })
    }
  }
}

interface RemoteNoteRow {
  id: string
  title: string | null
  content: string | null
  project_id: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

async function pullRemoteNotes(userId: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.from('notes').select('*').eq('user_id', userId)
  if (error || !data) return

  for (const row of data as RemoteNoteRow[]) {
    const local = await db.notes.get(row.id)
    // A local row with unpushed changes always wins locally — the next
    // push will reconcile it, never a pull.
    if (local?.dirty === 1) continue
    if (local && local.updatedAt >= row.updated_at) continue

    const merged: LocalNote = {
      id: row.id,
      title: row.title ?? '',
      content: row.content ?? '',
      projectId: row.project_id,
      tags: row.tags ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dirty: 0,
      deletedAt: null,
    }
    await db.notes.put(merged)
  }
}

// --- Voice notes -----------------------------------------------------
// Only metadata syncs (transcript, summary, status, duration) — the audio
// itself stays on the device that recorded it in this phase (see ADR 0007
// and the Phase 2 status notes). A voice note pulled onto another device
// shows its transcript but plays back nowhere until audio backup ships.

async function pushDirtyVoiceNotes(userId: string): Promise<void> {
  if (!supabase) return
  const dirty = (await db.voiceNotes.toArray()).filter((v) => v.dirty === 1)

  for (const voiceNote of dirty) {
    if (voiceNote.deletedAt) {
      const { error } = await supabase.from('voice_notes').delete().eq('id', voiceNote.id)
      if (error) continue
      await db.voiceNotes.delete(voiceNote.id)
      continue
    }

    const { error } = await supabase.from('voice_notes').upsert({
      id: voiceNote.id,
      user_id: userId,
      project_id: voiceNote.projectId,
      storage_path: voiceNote.storagePath,
      duration_seconds: voiceNote.durationSeconds,
      transcript: voiceNote.transcript,
      summary: voiceNote.summary,
      created_at: voiceNote.createdAt,
      updated_at: voiceNote.updatedAt,
    })
    if (!error) {
      await db.voiceNotes.update(voiceNote.id, { dirty: 0 })
    }
  }
}

interface RemoteVoiceNoteRow {
  id: string
  project_id: string | null
  storage_path: string | null
  duration_seconds: number | null
  transcript: string | null
  summary: string | null
  created_at: string
  updated_at: string
}

async function pullRemoteVoiceNotes(userId: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.from('voice_notes').select('*').eq('user_id', userId)
  if (error || !data) return

  for (const row of data as RemoteVoiceNoteRow[]) {
    const local = await db.voiceNotes.get(row.id)
    if (local?.dirty === 1) continue
    if (local && local.updatedAt >= row.updated_at) continue

    if (local) {
      // Never on this device: keep whatever local audio/status it already
      // has and just take the newer metadata (typically a transcript that
      // finished processing).
      await db.voiceNotes.update(row.id, {
        transcript: row.transcript,
        summary: row.summary,
        status: row.transcript ? 'ready' : local.status,
        storagePath: row.storage_path,
        updatedAt: row.updated_at,
        dirty: 0,
      })
      continue
    }

    const merged: LocalVoiceNote = {
      id: row.id,
      projectId: row.project_id,
      durationSeconds: row.duration_seconds ?? 0,
      storagePath: row.storage_path,
      transcript: row.transcript,
      summary: row.summary,
      status: row.transcript ? 'ready' : 'recorded',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      audioBlob: null,
      dirty: 0,
      audioDirty: 0,
      deletedAt: null,
    }
    await db.voiceNotes.put(merged)
  }
}

// --- Meetings ----------------------------------------------------------
// Unlike notes/voice notes, meetings are normalized across five remote
// tables (meetings, participants, meeting_participants, recordings,
// transcripts) that already existed from Phase 0's schema. The local side
// stays simple (participant names as a plain array, like note tags) and
// this is where that gets reconciled with the normalized shape.
//
// `recordings.id` and `transcripts.id` are just set equal to the meeting's
// own id — one continuous recording and one transcript per meeting in this
// phase (no pause/resume producing multiple recordings), so a 1:1 id keeps
// the upserts simple without needing to look anything up first.

async function resolveParticipantId(userId: string, name: string): Promise<string | null> {
  if (!supabase) return null
  const { data: existing } = await supabase
    .from('participants')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: created, error } = await supabase
    .from('participants')
    .insert({ user_id: userId, name })
    .select('id')
    .single()
  if (error || !created) return null
  return created.id as string
}

async function pushDirtyMeetings(userId: string): Promise<void> {
  if (!supabase) return
  const dirty = (await db.meetings.toArray()).filter((m) => m.dirty === 1)

  for (const meeting of dirty) {
    if (meeting.deletedAt) {
      const { error } = await supabase.from('meetings').delete().eq('id', meeting.id)
      if (error) continue
      await db.meetings.delete(meeting.id)
      continue
    }

    const { error: meetingError } = await supabase.from('meetings').upsert({
      id: meeting.id,
      user_id: userId,
      title: meeting.title || 'Untitled meeting',
      agenda: meeting.agenda,
      status: meeting.status,
      started_at: meeting.startedAt,
      ended_at: meeting.endedAt,
      created_at: meeting.createdAt,
      updated_at: meeting.updatedAt,
    })
    if (meetingError) continue

    const { error: recordingError } = await supabase.from('recordings').upsert({
      id: meeting.id,
      meeting_id: meeting.id,
      storage_path: meeting.storagePath,
      duration_seconds: meeting.durationSeconds,
      upload_status: meeting.storagePath ? 'uploaded' : 'pending',
    })
    if (recordingError) console.error('[mynotes] recording upsert failed', recordingError)

    const { error: transcriptError } = await supabase.from('transcripts').upsert({
      id: meeting.id,
      meeting_id: meeting.id,
      provider: 'deepgram',
      raw_text: meeting.transcript,
    })
    if (transcriptError) console.error('[mynotes] transcript upsert failed', transcriptError)

    const participantIds = (
      await Promise.all(meeting.participantNames.map((name) => resolveParticipantId(userId, name)))
    ).filter((id): id is string => id !== null)

    await supabase.from('meeting_participants').delete().eq('meeting_id', meeting.id)
    if (participantIds.length > 0) {
      await supabase.from('meeting_participants').insert(
        participantIds.map((participant_id) => ({ meeting_id: meeting.id, participant_id })),
      )
    }

    await db.meetings.update(meeting.id, { dirty: 0 })
  }
}

interface RemoteMeetingRow {
  id: string
  title: string | null
  agenda: string | null
  status: MeetingStatus
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  meeting_participants: { participants: { name: string } | null }[] | null
  recordings: { storage_path: string | null; duration_seconds: number | null }[] | null
  transcripts: { raw_text: string | null }[] | null
}

async function pullRemoteMeetings(userId: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase
    .from('meetings')
    .select(
      '*, meeting_participants(participants(name)), recordings(storage_path, duration_seconds), transcripts(raw_text)',
    )
    .eq('user_id', userId)
  if (error || !data) return

  for (const row of data as unknown as RemoteMeetingRow[]) {
    const participantNames = (row.meeting_participants ?? [])
      .map((mp) => mp.participants?.name)
      .filter((name): name is string => Boolean(name))
    const recording = row.recordings?.[0]
    const transcript = row.transcripts?.[0]?.raw_text ?? null

    const local = await db.meetings.get(row.id)
    if (local?.dirty === 1) continue
    if (local && local.updatedAt >= row.updated_at) continue

    if (local) {
      await db.meetings.update(row.id, {
        title: row.title ?? local.title,
        agenda: row.agenda,
        participantNames,
        status: transcript ? 'ready' : local.status,
        transcript,
        storagePath: recording?.storage_path ?? local.storagePath,
        updatedAt: row.updated_at,
        dirty: 0,
      })
      continue
    }

    const merged: LocalMeeting = {
      id: row.id,
      title: row.title ?? '',
      agenda: row.agenda,
      participantNames,
      status: row.status,
      durationSeconds: recording?.duration_seconds ?? 0,
      storagePath: recording?.storage_path ?? null,
      transcript,
      summary: null,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      audioBlob: null,
      dirty: 0,
      audioDirty: 0,
      deletedAt: null,
    }
    await db.meetings.put(merged)
  }
}

let watching = false

export function watchConnectivity(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('online', () => {
    void syncNow()
  })
}
