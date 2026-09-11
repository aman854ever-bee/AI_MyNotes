// Supabase Edge Function: transcribe
//
// Receives raw recorded audio from the app and forwards it to Deepgram
// using a server-side secret, so the Deepgram API key is never shipped to
// the browser (see docs/decisions/0007-api-key-handling.md).
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

  let audio: ArrayBuffer
  try {
    audio = await req.arrayBuffer()
  } catch {
    return json({ error: 'Could not read the uploaded audio' }, 400)
  }

  if (audio.byteLength === 0) {
    return json({ error: 'No audio received' }, 400)
  }

  // MediaRecorder in the app records webm/opus by default; whatever the
  // browser actually sent (via Content-Type) is passed straight through.
  const contentType = req.headers.get('content-type') || 'audio/webm'

  try {
    const dgResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
      method: 'POST',
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': contentType,
      },
      body: audio,
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
