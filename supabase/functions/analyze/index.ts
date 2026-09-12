// Supabase Edge Function: analyze
//
// Takes a meeting transcript and asks Gemini for a summary, candidate
// decisions, and candidate action items — returned as plain JSON for the
// client to turn into individually-approvable suggestions (ADR 0008,
// ADR 0013, PRD Section 19: AI suggests, the user approves each one,
// nothing here is a fact on its own).
//
// Deploy:   supabase functions deploy analyze
// Secret:   supabase secrets set GEMINI_API_KEY=your-key-here
// Model:    see supabase/functions/_shared/gemini.ts for the default and
//           how to override it.

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

interface RequestPayload {
  transcript?: string
  title?: string
  agenda?: string | null
  participantNames?: string[]
}

const SYSTEM_PROMPT = `You read meeting transcripts and extract structured information for a personal notes app. Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:

{
  "summary": "2-4 sentence plain-language summary of the meeting",
  "decisions": [{ "text": "a decision that was made", "context": "brief context or null" }],
  "actionItems": [{ "title": "a concrete follow-up task", "owner": "person's name mentioned as owner, or null", "dueDate": "YYYY-MM-DD if a date was mentioned, else null" }]
}

Only include a decision if the transcript shows something was actually decided, not just discussed. Only include an action item if it's a concrete, actionable task. Empty arrays are fine and expected for short or unfocused transcripts. Never invent participants, dates, or facts not present in the transcript.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!isGeminiConfigured()) {
    console.error('[analyze] GEMINI_API_KEY is not set — run `supabase secrets set GEMINI_API_KEY=...`')
    return json({ error: 'Analysis is not configured on the server yet' }, 500)
  }

  let payload: RequestPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  if (!payload.transcript || payload.transcript.trim().length === 0) {
    return json({ error: 'No transcript to analyze' }, 400)
  }

  const userContent = [
    payload.title ? `Title: ${payload.title}` : null,
    payload.agenda ? `Agenda: ${payload.agenda}` : null,
    payload.participantNames?.length ? `Participants: ${payload.participantNames.join(', ')}` : null,
    '',
    'Transcript:',
    payload.transcript,
  ]
    .filter((line) => line !== null)
    .join('\n')

  try {
    const { text } = await callGemini({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      maxOutputTokens: 1024,
      jsonMode: true,
    })

    let parsed: { summary?: string; decisions?: unknown[]; actionItems?: unknown[] }
    try {
      // Strip a ```json fence if the model added one despite instructions
      // and the JSON response mime type.
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
      parsed = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('[analyze] could not parse model output as JSON', text, parseErr)
      return json({ error: 'The model response could not be parsed' }, 502)
    }

    return json({
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    })
  } catch (err) {
    if (err instanceof GeminiApiError) {
      console.error('[analyze] Gemini API error', err.status, err.detail)
      return json({ error: 'The analysis provider returned an error' }, 502)
    }
    console.error('[analyze] unexpected error', err)
    return json({ error: 'Unexpected server error' }, 500)
  }
})
