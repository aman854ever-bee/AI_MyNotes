// Supabase Edge Function: analyze
//
// Takes a meeting transcript and asks Claude for a summary, candidate
// decisions, and candidate action items — returned as plain JSON for the
// client to turn into individually-approvable suggestions (ADR 0008,
// PRD Section 19: AI suggests, the user approves each one, nothing here
// is a fact on its own).
//
// Deploy:   supabase functions deploy analyze
// Secret:   supabase secrets set ANTHROPIC_API_KEY=your-key-here
// Model:    optionally supabase secrets set ANTHROPIC_MODEL=... to override
//           the default below — Claude's knowledge cutoff means the model
//           ID picked here may not be current by the time this deploys;
//           check https://docs.claude.com/en/docs/about-claude/models for
//           the current recommended fast/cheap model and update either the
//           secret or the fallback string if the default 404s.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-3-5-haiku-20241022'

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
  if (!ANTHROPIC_API_KEY) {
    console.error('[analyze] ANTHROPIC_API_KEY is not set — run `supabase secrets set ANTHROPIC_API_KEY=...`')
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('[analyze] Anthropic API error', response.status, detail)
      return json({ error: 'The analysis provider returned an error' }, 502)
    }

    const result = await response.json()
    const text: string = result?.content?.[0]?.text ?? ''

    let parsed: { summary?: string; decisions?: unknown[]; actionItems?: unknown[] }
    try {
      // Strip a ```json fence if the model added one despite instructions.
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
    console.error('[analyze] unexpected error', err)
    return json({ error: 'Unexpected server error' }, 500)
  }
})
