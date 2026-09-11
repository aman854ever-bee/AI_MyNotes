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
  status: MeetingStatus
  startedAt: string | null
  endedAt: string | null
}

export interface ActionItem {
  id: string
  title: string
  owner: string | null
  dueDate: string | null
  status: ActionStatus
  sourceMeetingId: string | null
  confidence: Confidence | null
}

export interface Reminder {
  id: string
  remindAt: string
  status: 'scheduled' | 'sent' | 'snoozed' | 'done' | 'cancelled'
}
