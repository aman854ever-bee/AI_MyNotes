import { supabase, isSupabaseConfigured } from './supabaseClient'
import { db, type LocalNote, type LocalVoiceNote } from './db'

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

let watching = false

export function watchConnectivity(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('online', () => {
    void syncNow()
  })
}
