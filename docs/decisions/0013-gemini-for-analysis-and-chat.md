# ADR 0013: Switch AI analysis + chat from Anthropic to Gemini

Date: 2026-09-12 · Status: Accepted

## Context
ADR 0008 chose the Anthropic API as the engine behind `analyze` (meeting
summary/decisions/action-item extraction) and, later, `chat` (free-form
Q&A grounded in a meeting's transcript). Both are currently blocked — the
Anthropic account has no credit balance.

Separately, Aman is deciding what platform work to invest in next (see
`mynotes/00-status-and-decisions.md` in the project). Rather than just
topping up Anthropic credit, Aman chose to move both functions to
Google's Gemini API instead.

## Decision
**Engine for `analyze` and `chat`: Gemini** (`gemini-3.6-flash` by
default — see note below), replacing Anthropic entirely for these two functions.
`transcribe` is unaffected — Deepgram continues to handle speech-to-text;
this change only touches the transcript-in / structured-output-or-chat-out
step.

**Tier: Gemini's free tier**, a deliberate choice from Aman ("It's R&D
time for me"), made with the tradeoff explicitly on the table: on the free
tier, Google may use prompt/response content — including meeting
transcripts — to improve their products, with possible human review. This
is acceptable for now because the app is Aman's own personal use, not
handling other people's data. **Revisit if this app ever handles someone
else's meeting content** — move to Gemini's paid tier at that point (a
few cents/month at this volume, and Google's data-use terms flip to "not
used to improve products").

**Scope: full swap, not a partial pilot.** Both `analyze` and `chat` move
to Gemini together, not staged one-at-a-time.

**Shared provider code**: both functions now import a single
`supabase/functions/_shared/gemini.ts` helper rather than each having its
own inline Anthropic-calling code (which is what ADR 0008's original
implementation did). The next provider swap — if there is one — should
mean editing this one file, not every function that calls an LLM.

**Secret**: `GEMINI_API_KEY`, entered by Aman directly into Supabase's
Edge Function secrets, same handling as every other API key (ADR 0007) —
Claude never sees the value. Replaces `ANTHROPIC_API_KEY` for these two
functions once the switch is verified working.

## Consequences
- `analyze`'s JSON-shape contract with the client (`summary` /
  `decisions` / `actionItems`) is unchanged — Gemini is asked for the same
  shape via its own JSON response mode (`responseMimeType:
  "application/json"`), with the same defensive fence-stripping parse as a
  fallback, so the client-side code needs no changes.
- `chat`'s request/response shape (`messages` in, `reply` out) is also
  unchanged for the same reason.
- **Live-tested end-to-end on 2026-09-13**: `analyze` on a sample
  transcript (summary, decisions, and action items all extracted
  correctly) and `chat` (correctly answered a grounded question about
  the same transcript, including declining to invent facts not in
  it). Both deployed via `supabase functions deploy` from Aman's own
  machine (Node.js + the Supabase CLI, run via `npx`).
- **Model correction during that first test**: the original default,
  `gemini-2.5-flash`, returned a 404 — Google had retired it for new
  API keys and pointed callers at `gemini-3.6-flash` instead (seen live
  in the `analyze` function's Supabase logs, not something known ahead
  of time). Fixed by changing the default in
  `supabase/functions/_shared/gemini.ts`; the `GEMINI_MODEL` secret
  remains available as a same-day override if this happens again
  without needing a redeploy.
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` secrets become unused by these
  two functions (left in place rather than removed, in case of a future
  rollback — no cost to leaving them set).
