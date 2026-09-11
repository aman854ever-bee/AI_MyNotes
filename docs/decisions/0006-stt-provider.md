# ADR 0006: Deepgram as the speech-to-text provider

Date: 2026-09-11 · Status: Accepted

## Decision
Phase 2 (Voice notes) uses **Deepgram** (Nova-3) for speech-to-text,
narrowing the "Deepgram or AssemblyAI" left open in ADR 0004. Reasons:
reasonable accuracy on English/Hindi code-switching, competitive per-minute
pricing, and a simple REST API that's easy to call from a serverless
function. Aman owns the Deepgram account and API key (per ADR 0004).

Browser-native Web Speech API and Gemini were considered and set aside for
this specific job — Web Speech API works with zero setup but is
lower-accuracy and Chrome/Edge-only; Gemini is strong at summarizing text
but was flagged as a fidelity/timestamp risk for raw audio transcription
specifically. Both stay open for other jobs (Gemini in particular is still
a candidate for Phase 4's summarization/analysis step).

## Consequences
The STT call happens behind one interface (`transcribeAudio()` in the sync
layer) so swapping providers later stays a contained change, per PRD
Section 16.
