// Browser-facing microphone access, shared by VoiceRecorder and
// MeetingRecorder. All the "what do we tell the user" decisions live in
// lib/micGuidance.ts (pure, unit tested); this file is the part that
// touches navigator and therefore can't be.
//
// Why it exists: both recorder screens used to do
//
//     navigator.mediaDevices.getUserMedia({ audio: true })
//       .then(...)
//       .catch(() => setPhase('denied'))
//
// which collapses every possible failure into "Microphone access was
// denied." That's actively misleading — it's equally what you see when the
// device has no microphone, when another app holds the mic, when the page
// isn't on a secure origin, or when an embedding host blocks capture by
// policy. In none of those cases does "allow access in your site settings"
// help. On Android it was shown even though no permission prompt had ever
// appeared, because the app's manifest was missing RECORD_AUDIO, so there
// was nothing for the user to have denied.

import { isNativePlatform } from './capacitorAuth'
import {
  classifyMicError,
  insecureContextFailure,
  pickAudioMimeType,
  unsupportedFailure,
  type MicFailure,
  type MicHost,
  type MicPermissionState,
} from './micGuidance'

export type { MicFailure, MicHost, MicPermissionState } from './micGuidance'

/**
 * Which shell we're running in, for permission instructions only.
 *
 * Deliberately coarse: this drives help text, never behavior, so a wrong
 * guess shows slightly-off instructions rather than breaking recording.
 * Capacitor's check is authoritative for native; the rest is UA sniffing,
 * which is acceptable for this purpose and nothing else. Order matters —
 * Edge's UA contains "Chrome", and Chrome's contains "Safari".
 */
export function detectHost(): MicHost {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent

  if (isNativePlatform()) {
    return /iPhone|iPad|iPod/i.test(ua) ? 'ios-app' : 'android-app'
  }
  if (!ua) return 'other'
  if (/Edg\//.test(ua)) return 'edge'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\//.test(ua)) return 'chrome'
  if (/Safari\//.test(ua)) return 'safari'
  return 'other'
}

/** True when this runtime can record audio at all, permissions aside. */
export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

/**
 * getUserMedia needs a secure context. Capacitor serves the app from
 * https://localhost inside the WebView, which already counts as secure, so
 * this only ever trips on a plain-http deployment.
 */
export function isSecureContextForCapture(): boolean {
  if (typeof window === 'undefined') return true
  if (window.isSecureContext) return true
  const host = window.location?.hostname ?? ''
  return host === 'localhost' || host === '127.0.0.1'
}

/**
 * Reads the current microphone permission *without* prompting.
 *
 * The Permissions API is the only way to tell "the user already refused"
 * apart from "we haven't asked yet" — worth knowing, because in the first
 * case getUserMedia() fails instantly with no prompt and the only fix is
 * in settings, which is a different thing to tell the user. Firefox and
 * older Safari don't expose 'microphone' here, hence 'unknown', which
 * callers must treat as "just try it and see" rather than as a failure.
 */
export async function getMicPermissionState(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    // 'microphone' is valid per the Permissions spec but missing from some
    // TS DOM lib versions' PermissionName union, so this goes through a
    // cast rather than widening the call signature.
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state
    }
    return 'unknown'
  } catch {
    // Chrome throws TypeError for unsupported permission names rather than
    // rejecting with a DOMException — either way, we don't know.
    return 'unknown'
  }
}

export type MicRequestResult = { ok: true; stream: MediaStream } | { ok: false; failure: MicFailure }

/**
 * Asks for the microphone, doing the environment checks that have to
 * happen before getUserMedia is even worth calling.
 *
 * Callers get either a live stream or a fully-formed explanation — they
 * never have to interpret a DOMException themselves.
 */
export async function requestMicrophone(): Promise<MicRequestResult> {
  const host = detectHost()

  if (!isRecordingSupported()) return { ok: false, failure: unsupportedFailure(host) }
  if (!isSecureContextForCapture()) return { ok: false, failure: insecureContextFailure() }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    return { ok: true, stream }
  } catch (err) {
    const name =
      typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : ''
    return { ok: false, failure: classifyMicError(name, host) }
  }
}

/**
 * Best container this runtime can actually produce, or undefined to let
 * MediaRecorder choose. See pickAudioMimeType's note on why this is
 * explicit rather than left to the platform default.
 */
export function preferredAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  return pickAudioMimeType((type) => MediaRecorder.isTypeSupported(type))
}
