import Dexie, { type Table } from 'dexie'
import type { Note, Project } from '../types'

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

class MyNotesDB extends Dexie {
  notes!: Table<LocalNote, string>
  projects!: Table<LocalProject, string>

  constructor() {
    super('mynotes')
    this.version(1).stores({
      notes: 'id, updatedAt, dirty',
      projects: 'id, updatedAt, dirty',
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
