// Supabase Edge Function: transcribe
//
// Receives a short-lived signed URL pointing at a recording already
// uploaded to Supabase Storage, and asks Deepgram to fetch and transcribe
// it directly — no audio bytes pass through this function, so there's no
// practical size/duration limit tied to the function's own request body
// (see docs/decisions/0007-api-key-handling.md for why the Deepgram key
// lives only here, never in the browser).
//
// Deploy:   supabase functions deploy transcribe
// Secret:   supabase secrets set DEEPGRAM_API_KEY=your-key-here
//
// The function keeps normal JWT verification on (the default) — the app
// already authenticates with Supabase, and supabase-js's
// `functions.invoke()` attaches that session automatically.

const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY')

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  if (!DEEPGRAM_API_KEY) {
    console.error('[transcribe] DEEPGRAM_API_KEY is not set — run `supabase secrets set DEEPGRAM_API_KEY=...`')
    return json({ error: 'Transcription is not configured on the server yet' }, 500)
  }

  let payload: { url?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body: { "url": "..." }' }, 400)
  }

  if (!payload.url) {
    return json({ error: 'Missing "url"' }, 400)
  }

  try {
    const dgResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
      method: 'POST',
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: payload.url }),
    })

    if (!dgResponse.ok) {
      const detail = await dgResponse.text()
      console.error('[transcribe] Deepgram error', dgResponse.status, detail)
      return json({ error: 'The transcription provider returned an error' }, 502)
    }

    const result = await dgResponse.json()
    const transcript: string = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

    return json({ transcript })
  } catch (err) {
    console.error('[transcribe] unexpected error', err)
    return json({ error: 'Unexpected server error' }, 500)
  }
})
