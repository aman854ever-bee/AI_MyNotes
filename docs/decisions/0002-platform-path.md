# ADR 0002: PWA first, native shell later

Date: 2026-09-11 · Status: Accepted

## Context
The PRD asks for native Android, iOS and macOS apps from day one (Section 7),
with Flutter as the candidate framework. This working environment has no
macOS/Xcode, and Aman's connected machine is Windows — native iOS/macOS
builds would need a Mac or a cloud build service (Codemagic, GitHub Actions
macOS runners) before any native work could even start.

Additionally: iOS suspends microphone capture when a web app is backgrounded
or the phone is locked, so even a native wrapper doesn't fully solve
"record while the phone is locked" without a proper foreground service /
background-audio entitlement.

## Decision
Build **Path A**: a React + TypeScript PWA (installable on Android, iOS via
Add to Home Screen, macOS and Windows), backed by Supabase. Defer a native
shell (Flutter or Capacitor) to V2, once the core AI loop is proven useful
daily — the native shell's main value is background recording on locked
iOS/Android phones.

## Consequence
PRD test scenarios "lock phone" and "app background" during recording
(Section 49) cannot pass in V1 on iOS/Android. This is accepted as a known
gap, not silently dropped — see the assessment's Cross-Platform Feasibility
section.
