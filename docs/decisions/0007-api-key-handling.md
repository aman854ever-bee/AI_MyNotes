# ADR 0007: Third-party API keys never reach the browser

Date: 2026-09-11 · Status: Accepted

## Decision
The Deepgram API key (and any future provider key — Anthropic, etc.) is
stored only as a Supabase Edge Function secret, never as a `VITE_*`
client-side env var. The browser uploads audio to Supabase Storage (or
posts it directly to the function) and calls a thin Supabase Edge Function
(`supabase/functions/transcribe`), which holds the real key and forwards
the request to Deepgram.

The alternative — embedding the key directly in the client bundle — was
rejected: once the PWA is deployed at a URL, anyone with that link could
read the key out of browser devtools/network traffic and spend against
Aman's Deepgram account. This was an explicit, discussed tradeoff (not a
default), decided in favor of the safer path even though it means standing
up a Supabase Edge Function before Phase 2 can be tested end-to-end.

## Consequences
- Voice notes still save fully locally (local-first, same as Phase 1) even
  with no Supabase project configured — only the transcription step is
  gated on the edge function being deployed and reachable.
- Requires Aman to: create a Supabase project (already pending from Phase
  1), deploy the `transcribe` function, and set `DEEPGRAM_API_KEY` as a
  function secret (not in `.env`, which only ever holds the public
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
