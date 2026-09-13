// Supabase Edge Function: chat
//
// Lets the user have a free-form conversation about ONE meeting — ask what
// was decided, who owns what, what someone said, etc. — grounded in that
// meeting's transcript (plus whatever summary/decisions/action items have
// already been produced). This is the primary way to get information out
// of a meeting; a formal "meeting minutes" document is a separate,
// explicitly user-triggered export, not something this function produces.
//
// Deploy:   supabase functions deploy chat
// Secret:   supabase secrets set GEMINI_API_KEY=your-key-here (same secret
//           as the analyze function — see supabase/functions/_shared/gemini.ts)

import { callGemini, GeminiApiError, isGeminiConfigured } from '../_shared/gemini.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestPayload {
  transcript?: string
  title?: string
  agenda?: string | null
  participantNames?: string[]
  summary?: string | null
  decisions?: { text: string; context?: string | null }[]
  actionItems?: { title: string; owner?: string | null; dueDate?: string | null }[]
  messages?: ChatMessage[]
}

// Keep the request bounded: only the most recent turns are sent, since the
// full transcript is already resent as context every time.
const MAX_HISTORY_MESSAGES = 20

function buildSystemPrompt(payload: RequestPayload): string {
  const parts = [
    `You answer questions about ONE specific meeting for a personal notes app. Only use the information given below — the transcript, and any summary, decisions, or action items already extracted from it. If something isn't in there, say plainly that the transcript doesn't cover it rather than guessing or inventing details.`,
    `Be concise and conversational. Quote or paraphrase the transcript when it helps answer the question.`,
    `If the user asks you to produce a formal meeting-minutes document, PDF, or export, tell them to use the "Generate document" option in the app instead of writing the full document out here — that's a separate feature.`,
    '',
    `Meeting: ${payload.title || 'Untitled meeting'}`,
  ]
  if (payload.agenda) parts.push(`Agenda: ${payload.agenda}`)
  if (payload.participantNames?.length) parts.push(`Participants: ${payload.participantNames.join(', ')}`)
  if (payload.summary) parts.push('', `Existing summary: ${payload.summary}`)
  if (payload.decisions?.length) {
    parts.push('', 'Decisions already recorded:')
    for (const d of payload.decisions) parts.push(`- ${d.text}${d.context ? ` (${d.context})` : ''}`)
  }
  if (payload.actionItems?.length) {
    parts.push('', 'Action items already recorded:')
    for (const a of payload.actionItems) {
      parts.push(`- ${a.title}${a.owner ? ` — owner: ${a.owner}` : ''}${a.dueDate ? `, due ${a.dueDate}` : ''}`)
    }
  }
  parts.push('', 'Full transcript:', payload.transcript ?? '')
  return parts.join('\n')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!isGeminiConfigured()) {
    console.error('[chat] GEMINI_API_KEY is not set — run `supabase secrets set GEMINI_API_KEY=...`')
    return json({ error: 'Chat is not configured on the server yet' }, 500)
  }

  let payload: RequestPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  if (!payload.transcript || payload.transcript.trim().length === 0) {
    return json({ error: 'This meeting has no transcript to chat about yet' }, 400)
  }
  if (!payload.messages || payload.messages.length === 0) {
    return json({ error: 'No message to respond to' }, 400)
  }

  const history = payload.messages.slice(-MAX_HISTORY_MESSAGES)

  try {
    const { text: reply } = await callGemini({
      system: buildSystemPrompt(payload),
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      maxOutputTokens: 700,
    })

    return json({ reply })
  } catch (err) {
    if (err instanceof GeminiApiError) {
      console.error('[chat] Gemini API error', err.status, err.detail)
      return json({ error: 'The chat provider returned an error' }, 502)
    }
    console.error('[chat] unexpected error', err)
    return json({ error: 'Unexpected server error' }, 500)
  }
})
