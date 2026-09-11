// Mirrors infra/supabase/migrations/0001_init.sql.
// Moves into packages/shared-types once the backend (services/api) needs it too.

export type MeetingStatus =
  | 'not_started' | 'recording' | 'paused' | 'stopped'
  | 'processing' | 'transcribing' | 'analyzing' | 'ready' | 'failed'

export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type Confidence = 'high' | 'medium' | 'low'

export interface Meeting {
  id: string
  title: string
  agenda: string | null
  participantNames: string[]
  status: MeetingStatus
  durationSeconds: number
  storagePath: string | null
  transcript: string | null
  summary: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ActionItem {
  id: string
  title: string
  owner: string | null
  dueDate: string | null
  status: ActionStatus
  sourceMeetingId: string | null
  confidence: Confidence | null
  createdFromSuggestionId: string | null
  createdAt: string
}

export interface Decision {
  id: string
  meetingId: string
  text: string
  context: string | null
  createdFromSuggestionId: string | null
  createdAt: string
}

export interface Reminder {
  id: string
  remindAt: string
  status: 'scheduled' | 'sent' | 'snoozed' | 'done' | 'cancelled'
}

// --- AI suggestions ------------------------------------------------------
// "AI suggests, user approves" (PRD Section 19) — nothing here is a fact
// until an explicit Approve moves it into `decisions`/`action_items`, or
// (for a summary) into `meetings.summary`.

export type SuggestionKind = 'summary' | 'decision' | 'action'
export type SuggestionStatus = 'pending' | 'approved' | 'ignored'

export type SuggestionPayload =
  | { kind: 'summary'; text: string }
  | { kind: 'decision'; text: string; context: string | null }
  | { kind: 'action'; title: string; owner: string | null; dueDate: string | null }

export interface Suggestion {
  id: string
  meetingId: string
  kind: SuggestionKind
  payload: SuggestionPayload
  confidence: Confidence | null
  status: SuggestionStatus
  createdAt: string
  updatedAt: string
}

export interface Note {
  id: string
  title: string
  content: string
  projectId: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  createdAt: string
}

export type VoiceNoteStatus = 'recorded' | 'transcribing' | 'ready' | 'error'

export interface VoiceNote {
  id: string
  projectId: string | null
  durationSeconds: number
  storagePath: string | null
  transcript: string | null
  summary: string | null
  status: VoiceNoteStatus
  createdAt: string
  updatedAt: string
}
