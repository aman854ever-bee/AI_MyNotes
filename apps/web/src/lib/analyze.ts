import { supabase } from './supabaseClient'
import { getMeeting, createSuggestion, listSuggestionsForMeeting } from './db'
import type { SuggestionPayload } from '../types'

// Calls the `analyze` Edge Function (holds ANTHROPIC_API_KEY server-side,
// same pattern as transcribe/Deepgram — ADR 0007) with the meeting's
// transcript, and turns its response into individually-approvable
// suggestion rows (ADR 0008). User-triggered only — see ADR 0008 for why
// this isn't automatic like transcription is.

interface AnalyzeResponse {
  summary?: string
  decisions?: { text: string; context?: string | null }[]
  actionItems?: { title: string; owner?: string | null; dueDate?: string | null }[]
  error?: string
}

export type AnalyzeResult = { ok: true } | { ok: false; message: string }

export async function requestMeetingAnalysis(meetingId: string): Promise<AnalyzeResult> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }

  const meeting = await getMeeting(meetingId)
  if (!meeting) return { ok: false, message: 'Meeting not found.' }
  if (!meeting.transcript) return { ok: false, message: 'This meeting has no transcript yet.' }

  const existing = await listSuggestionsForMeeting(meetingId)
  if (existing.length > 0) return { ok: true } // already analyzed — nothing to do

  try {
    const { data, error } = await supabase.functions.invoke<AnalyzeResponse>('analyze', {
      body: {
        transcript: meeting.transcript,
        title: meeting.title,
        agenda: meeting.agenda,
        participantNames: meeting.participantNames,
      },
    })

    if (error || !data) {
      console.error('[mynotes] analysis failed', error)
      return { ok: false, message: 'The analysis request failed. Check the analyze function logs.' }
    }
    if (data.error) {
      console.error('[mynotes] analysis failed', data.error)
      return { ok: false, message: data.error }
    }

    if (data.summary) {
      await createSuggestion({
        meetingId,
        kind: 'summary',
        payload: { kind: 'summary', text: data.summary } satisfies SuggestionPayload,
      })
    }
    for (const decision of data.decisions ?? []) {
      if (!decision.text) continue
      await createSuggestion({
        meetingId,
        kind: 'decision',
        payload: { kind: 'decision', text: decision.text, context: decision.context ?? null } satisfies SuggestionPayload,
      })
    }
    for (const action of data.actionItems ?? []) {
      if (!action.title) continue
      await createSuggestion({
        meetingId,
        kind: 'action',
        payload: {
          kind: 'action',
          title: action.title,
          owner: action.owner ?? null,
          dueDate: action.dueDate ?? null,
        } satisfies SuggestionPayload,
      })
    }

    return { ok: true }
  } catch (err) {
    console.error('[mynotes] analysis failed', err)
    return { ok: false, message: 'The analysis request failed unexpectedly.' }
  }
}
