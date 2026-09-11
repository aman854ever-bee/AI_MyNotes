# ADR 0008: Phase 4 (AI analysis) scope and trigger

Date: 2026-09-11 · Status: Accepted (decided autonomously — Aman asked Claude
to proceed through Phase 4 unattended and make the calls that would
normally be discussed; flagged here for review rather than held back)

## Decision
Phase 4 adds AI analysis of **meeting** transcripts only — not voice notes.
The `ai_suggestions` / `decisions` / `action_items` tables (from the Phase 0
schema) are meeting-scoped by design (`meeting_id not null` on
`ai_suggestions` and `decisions`), so this follows the schema rather than
inventing new scope.

**Engine**: the Anthropic API, per ADR 0004's original "Aman owns the
AI/STT provider accounts" decision, which already named it for
"summarization, decision/action extraction." A new Supabase Edge Function
(`supabase/functions/analyze`) holds `ANTHROPIC_API_KEY` as a server
secret, same pattern as `transcribe`/Deepgram (ADR 0007) — the key never
reaches the browser.

**Trigger: manual, not automatic.** Transcription (Phase 2/3) triggers
automatically once a recording is saved, but analysis is a separate,
user-initiated "Analyze meeting" button on a ready transcript. This is a
judgment call, not dictated by the PRD: automatic would match the
transcription UX, but analysis is a second paid API call per meeting on
top of Deepgram, and defaulting it to off gives explicit control over that
cost rather than firing it on every test recording. **Revisit this if it
turns out to be a friction point** — auto-trigger is a small change if
Aman would rather it just happen.

**Suggestions stay individually approvable**, matching `ai_suggestions`'
per-row `status` column (PRD Section 19 — AI suggests, user never gets a
change silently committed): the model returns a summary + a list of
candidate decisions + a list of candidate action items, each becomes its
own local suggestion row, and each gets its own Approve/Ignore control.
Approving a decision or action item creates the real `decisions` /
`action_items` row (linked back via `created_from_suggestion_id`);
approving the summary just fills `meetings.summary`. Ignoring only flips
the suggestion's own status — nothing else is touched.

## Consequences / known scope trim
Sync for `ai_suggestions`, `decisions`, and `action_items` is **push-only**
in this phase (local → Supabase), not the full bidirectional push+pull
built for notes/voice notes/meetings — these rows are created and consumed
in one sitting in the current UI (there's no cross-device suggestion review
flow yet), so pull wasn't built to keep this phase's scope in check. They
are still backed up remotely, just not pulled back down onto a second
device yet. Worth adding if a real workflow needs it.

No UI yet for browsing all decisions/action items/tasks across meetings —
that's Phase 5 ("Tasks & reminders"), so this phase only shows them inline
under the meeting they came from.
