import Dexie, { type Table } from 'dexie'
import type { ActionItem, Decision, Meeting, Note, Project, Suggestion, VoiceNote } from '../types'

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

// Suggestions/decisions/action items are simpler than the capture types
// above: no local editing UI, so no `deletedAt` tombstone — a suggestion
// is created once, flips pending -> approved|ignored once, and that's it.
export interface LocalSuggestion extends Suggestion {
  dirty: 0 | 1
}

export interface LocalDecision extends Decision {
  dirty: 0 | 1
}

export interface LocalActionItem extends ActionItem {
  dirty: 0 | 1
}

class MyNotesDB extends Dexie {
  notes!: Table<LocalNote, string>
  projects!: Table<LocalProject, string>
  voiceNotes!: Table<LocalVoiceNote, string>
  meetings!: Table<LocalMeeting, string>
  suggestions!: Table<LocalSuggestion, string>
  decisions!: Table<LocalDecision, string>
  actionItems!: Table<LocalActionItem, string>

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
    this.version(4).stores({
      notes: 'id, updatedAt, dirty',
      projects: 'id, updatedAt, dirty',
      voiceNotes: 'id, updatedAt, dirty',
      meetings: 'id, updatedAt, dirty',
      suggestions: 'id, meetingId, status, dirty',
      decisions: 'id, meetingId, dirty',
      actionItems: 'id, sourceMeetingId, dirty',
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

// --- AI suggestions, decisions, action items ----------------------------
// See ADR 0008. Created by lib/analyze.ts from a model response; approving
// one here creates the real decision/action item (or fills
// meetings.summary) and flips the suggestion's own status — nothing else
// changes as a side effect.

export interface CreateSuggestionInput {
  meetingId: string
  kind: Suggestion['kind']
  payload: Suggestion['payload']
  confidence?: Suggestion['confidence']
}

export async function createSuggestion(input: CreateSuggestionInput): Promise<LocalSuggestion> {
  const ts = nowIso()
  const suggestion: LocalSuggestion = {
    id: newId(),
    meetingId: input.meetingId,
    kind: input.kind,
    payload: input.payload,
    confidence: input.confidence ?? null,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
    dirty: 1,
  }
  await db.suggestions.put(suggestion)
  return suggestion
}

export async function updateSuggestionStatus(id: string, status: Suggestion['status']): Promise<void> {
  await db.suggestions.update(id, { status, updatedAt: nowIso(), dirty: 1 })
}

export async function listSuggestionsForMeeting(meetingId: string): Promise<LocalSuggestion[]> {
  const all = await db.suggestions.where('meetingId').equals(meetingId).toArray()
  return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
}

export interface CreateDecisionInput {
  meetingId: string
  text: string
  context?: string | null
  createdFromSuggestionId?: string | null
}

export async function createDecision(input: CreateDecisionInput): Promise<LocalDecision> {
  const decision: LocalDecision = {
    id: newId(),
    meetingId: input.meetingId,
    text: input.text,
    context: input.context ?? null,
    createdFromSuggestionId: input.createdFromSuggestionId ?? null,
    createdAt: nowIso(),
    dirty: 1,
  }
  await db.decisions.put(decision)
  return decision
}

export async function listDecisionsForMeeting(meetingId: string): Promise<LocalDecision[]> {
  return db.decisions.where('meetingId').equals(meetingId).toArray()
}

export interface CreateActionItemInput {
  title: string
  owner?: string | null
  dueDate?: string | null
  sourceMeetingId?: string | null
  confidence?: ActionItem['confidence']
  createdFromSuggestionId?: string | null
}

export async function createActionItem(input: CreateActionItemInput): Promise<LocalActionItem> {
  const actionItem: LocalActionItem = {
    id: newId(),
    title: input.title,
    owner: input.owner ?? null,
    dueDate: input.dueDate ?? null,
    status: 'pending',
    sourceMeetingId: input.sourceMeetingId ?? null,
    confidence: input.confidence ?? null,
    createdFromSuggestionId: input.createdFromSuggestionId ?? null,
    createdAt: nowIso(),
    dirty: 1,
  }
  await db.actionItems.put(actionItem)
  return actionItem
}

export async function listActionItemsForMeeting(meetingId: string): Promise<LocalActionItem[]> {
  return db.actionItems.where('sourceMeetingId').equals(meetingId).toArray()
}

/**
 * Everything still outstanding, across every meeting — what the Home
 * dashboard's "Today's brief" and the Reminders screen are built on.
 * Sorted by due date, with undated items last (they're not urgent by
 * definition, so they shouldn't crowd out dated ones).
 */
export async function listOpenActionItems(): Promise<LocalActionItem[]> {
  const all = await db.actionItems.toArray()
  return all
    .filter((item) => item.status === 'pending' || item.status === 'in_progress')
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return a.createdAt < b.createdAt ? -1 : 1
    })
}
