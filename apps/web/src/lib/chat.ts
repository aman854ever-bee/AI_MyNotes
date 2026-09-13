import { supabase } from './supabaseClient'
import { getMeeting, listDecisionsForMeeting, listActionItemsForMeeting } from './db'

// Calls the `chat` Edge Function (same GEMINI_API_KEY as analyze — ADR
// 0013) so the user can ask free-form questions about a meeting instead of
// only reading a generated document. Nothing here is written back to the
// meeting's own data — it's just a conversation grounded in what's already
// there (transcript, summary, decisions, action items).

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  reply?: string
  error?: string
}

export type ChatResult = { ok: true; reply: string } | { ok: false; message: string }

export async function requestMeetingChatReply(meetingId: string, messages: ChatMessage[]): Promise<ChatResult> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured yet.' }

  const meeting = await getMeeting(meetingId)
  if (!meeting) return { ok: false, message: 'Meeting not found.' }
  if (!meeting.transcript) return { ok: false, message: 'This meeting has no transcript yet.' }

  const [decisions, actionItems] = await Promise.all([
    listDecisionsForMeeting(meetingId),
    listActionItemsForMeeting(meetingId),
  ])

  try {
    const { data, error } = await supabase.functions.invoke<ChatResponse>('chat', {
      body: {
        transcript: meeting.transcript,
        title: meeting.title,
        agenda: meeting.agenda,
        participantNames: meeting.participantNames,
        summary: meeting.summary,
        decisions: decisions.map((d) => ({ text: d.text, context: d.context })),
        actionItems: actionItems.map((a) => ({ title: a.title, owner: a.owner, dueDate: a.dueDate })),
        messages,
      },
    })

    if (error || !data) {
      console.error('[mynotes] chat failed', error)
      return { ok: false, message: 'The chat request failed. Check the chat function logs.' }
    }
    if (data.error) {
      console.error('[mynotes] chat failed', data.error)
      return { ok: false, message: data.error }
    }

    return { ok: true, reply: data.reply ?? '' }
  } catch (err) {
    console.error('[mynotes] chat failed', err)
    return { ok: false, message: 'The chat request failed unexpectedly.' }
  }
}
