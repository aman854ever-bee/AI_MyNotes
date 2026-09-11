import Dexie, { type Table } from 'dexie'
import type { Meeting, Note, Project, VoiceNote } from '../types'

// Local-first: every note is created, edited and deleted here first, with
// no network round trip — that's what "offline supported" (PRD Section 34)
// actually means. `dirty` marks rows sync.ts still needs to push to
// Supabase; `deletedAt` is a tombstone so a delete can sync too, instead of
// just vanishing locally and reappearing on the next pull.
export interface LocalNote extends Note {
  dirty: 0 | 1
  deletedAt: string | null
}

export interface LocalProject extends Project {
  dirty: 0 | 1
  deletedAt: string | null
}

// The audio itself lives only in IndexedDB (as a Blob) until sync.ts uploads
// it to Supabase Storage — `storagePath` is null until that happens.
// `dirty` covers metadata (transcript, status, etc.); `audioDirty` tracks
// the upload separately since the audio only ever needs to go up once.
export interface LocalVoiceNote extends VoiceNote {
  audioBlob: Blob | null
  dirty: 0 | 1
  audioDirty: 0 | 1
  deletedAt: string | null
}

// Same shape as LocalVoiceNote, plus title/agenda/participants. Status only
// ever takes the client-relevant subset of the remote MeetingStatus enum
// here: 'stopped' (recorded, not yet sent for transcription — recording
// itself happens transiently in MeetingRecorder's own state before a
// LocalMeeting even exists), 'transcribing', 'ready', 'failed'.
export interface LocalMeeting extends Meeting {
  audioBlob: Blob | null
  dirty: 0 | 1
  audioDirty: 0 | 1
  deletedAt: string | null
}

class MyNotesDB extends Dexie {
  notes!: Table<LocalNote, string>
  projects!: Table<LocalProject, string>
  voiceNotes!: Table<LocalVoiceNote, string>
  meetings!: Table<LocalMeeting, string>

  constructor() {
    super('mynotes')
    this.version(1).stores({
      notes: 'id, updatedAt, dirty',
      projects: 'id, updatedAt, dirty',
    })
    this.version(2).stores({
      notes: 'id, updatedAt, dirty',
      projects: 'id, updatedAt, dirty',
      voiceNotes: 'id, updatedAt, dirty',
    })
    this.version(3).stores({
      notes: 'id, updatedAt, dirty',
      projects: 'id, updatedAt, dirty',
      voiceNotes: 'id, updatedAt, dirty',
      meetings: 'id, updatedAt, dirty',
    })
  }
}

export const db = new MyNotesDB()

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return crypto.randomUUID()
}

export interface CreateNoteInput {
  title: string
  content: string
  projectId?: string | null
  tags?: string[]
}

export async function createNote(input: CreateNoteInput): Promise<LocalNote> {
  const ts = nowIso()
  const note: LocalNote = {
    id: newId(),
    title: input.title,
    content: input.content,
    projectId: input.projectId ?? null,
    tags: input.tags ?? [],
    createdAt: ts,
    updatedAt: ts,
    dirty: 1,
    deletedAt: null,
  }
  await db.notes.put(note)
  return note
}

export type UpdateNoteInput = Partial<Pick<Note, 'title' | 'content' | 'projectId' | 'tags'>>

export async function updateNote(id: string, patch: UpdateNoteInput): Promise<void> {
  await db.notes.update(id, { ...patch, updatedAt: nowIso(), dirty: 1 })
}

export async function deleteNote(id: string): Promise<void> {
  const ts = nowIso()
  await db.notes.update(id, { deletedAt: ts, updatedAt: ts, dirty: 1 })
}

export async function getNote(id: string): Promise<LocalNote | undefined> {
  return db.notes.get(id)
}

export async function listNotes(): Promise<LocalNote[]> {
  const all = await db.notes.toArray()
  return all.filter((n) => !n.deletedAt).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

// --- Voice notes -----------------------------------------------------
// Same local-first shape as notes: recorded and saved here first, synced
// (audio upload + transcription) opportunistically by sync.ts/transcribe.ts.

export interface CreateVoiceNoteInput {
  audioBlob: Blob
  durationSeconds: number
  projectId?: string | null
}

export async function createVoiceNote(input: CreateVoiceNoteInput): Promise<LocalVoiceNote> {
  const ts = nowIso()
  const voiceNote: LocalVoiceNote = {
    id: newId(),
    projectId: input.projectId ?? null,
    durationSeconds: input.durationSeconds,
    audioBlob: input.audioBlob,
    storagePath: null,
    transcript: null,
    summary: null,
    status: 'recorded',
    createdAt: ts,
    updatedAt: ts,
    dirty: 1,
    audioDirty: 1,
    deletedAt: null,
  }
  await db.voiceNotes.put(voiceNote)
  return voiceNote
}

export type UpdateVoiceNoteInput = Partial<
  Pick<LocalVoiceNote, 'transcript' | 'summary' | 'status' | 'storagePath' | 'audioDirty'>
>

export async function updateVoiceNote(id: string, patch: UpdateVoiceNoteInput): Promise<void> {
  await db.voiceNotes.update(id, { ...patch, updatedAt: nowIso(), dirty: 1 })
}

export async function deleteVoiceNote(id: string): Promise<void> {
  const ts = nowIso()
  await db.voiceNotes.update(id, { deletedAt: ts, updatedAt: ts, dirty: 1 })
}

export async function getVoiceNote(id: string): Promise<LocalVoiceNote | undefined> {
  return db.voiceNotes.get(id)
}

export async function listVoiceNotes(): Promise<LocalVoiceNote[]> {
  const all = await db.voiceNotes.toArray()
  return all.filter((v) => !v.deletedAt).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

// --- Meetings ----------------------------------------------------------
// Same local-first shape as voice notes. Participants are captured as
// plain names (like tags on notes — see ADR/decision 7) rather than full
// participant records; sync.ts resolves each name to a `participants` row
// (creating one if needed) when it pushes to Supabase.

export interface CreateMeetingInput {
  title: string
  agenda?: string | null
  participantNames: string[]
  audioBlob: Blob
  durationSeconds: number
  startedAt: string
  endedAt: string
}

export async function createMeeting(input: CreateMeetingInput): Promise<LocalMeeting> {
  const ts = nowIso()
  const meeting: LocalMeeting = {
    id: newId(),
    title: input.title,
    agenda: input.agenda ?? null,
    participantNames: input.participantNames,
    status: 'stopped',
    durationSeconds: input.durationSeconds,
    audioBlob: input.audioBlob,
    storagePath: null,
    transcript: null,
    summary: null,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    createdAt: ts,
    updatedAt: ts,
    dirty: 1,
    audioDirty: 1,
    deletedAt: null,
  }
  await db.meetings.put(meeting)
  return meeting
}

export type UpdateMeetingInput = Partial<
  Pick<
    LocalMeeting,
    'title' | 'agenda' | 'participantNames' | 'transcript' | 'summary' | 'status' | 'storagePath' | 'audioDirty'
  >
>

export async function updateMeeting(id: string, patch: UpdateMeetingInput): Promise<void> {
  await db.meetings.update(id, { ...patch, updatedAt: nowIso(), dirty: 1 })
}

export async function deleteMeeting(id: string): Promise<void> {
  const ts = nowIso()
  await db.meetings.update(id, { deletedAt: ts, updatedAt: ts, dirty: 1 })
}

export async function getMeeting(id: string): Promise<LocalMeeting | undefined> {
  return db.meetings.get(id)
}

export async function listMeetings(): Promise<LocalMeeting[]> {
  const all = await db.meetings.toArray()
  return all.filter((m) => !m.deletedAt).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}
