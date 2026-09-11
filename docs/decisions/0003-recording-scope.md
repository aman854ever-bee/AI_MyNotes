# ADR 0003: Meeting Recorder is microphone-only in V1

Date: 2026-09-11 · Status: Accepted

## Context
The PRD's "Meeting Recorder" doesn't specify whether it means capturing the
device microphone (an in-person meeting, a speakerphone call) or capturing
the system/virtual-call audio of another app (Zoom, Teams, Google Meet).
These are architecturally unrelated: the former is a standard browser API on
every platform; the latter needs OS-specific loopback or screen-capture
APIs and is effectively unavailable to third-party apps on iOS.

## Decision
V1 records the device **microphone only**. Virtual-call audio capture is
out of scope until it gets its own design pass.
