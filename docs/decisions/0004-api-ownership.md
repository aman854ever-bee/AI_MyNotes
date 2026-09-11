# ADR 0004: Aman owns the AI/STT provider accounts

Date: 2026-09-11 · Status: Accepted

## Decision
Aman provisions and pays for the third-party accounts MyNotes depends on:
the Anthropic API (summarization, decision/action extraction) and a
speech-to-text provider (Deepgram or AssemblyAI, chosen for reasonable
English/Hindi code-switching support). All provider calls happen server-side
so keys are never shipped to the client, and the STT provider stays
swappable behind one interface (PRD Section 16).
