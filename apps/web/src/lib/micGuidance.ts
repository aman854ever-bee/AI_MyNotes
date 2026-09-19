// Pure microphone-permission logic: given a failure and a platform, work
// out what to tell the user.
//
// Deliberately zero-dependency — no React, no Capacitor, no DOM — so it
// can be unit tested without `npm install` resolving anything, the same
// reason lib/format.ts is shaped this way (see docs/testing.md). The
// browser-facing half lives in lib/microphone.ts and calls into here.

export type MicHost = 'android-app' | 'ios-app' | 'chrome' | 'edge' | 'firefox' | 'safari' | 'other'

export type MicPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown'

export type MicFailureReason =
  | 'denied' //            the user or the OS refused
  | 'no-device' //         no microphone hardware present
  | 'in-use' //            another app/tab holds the mic
  | 'insecure-context' //  not https:// (or localhost)
  | 'unsupported' //       no getUserMedia / MediaRecorder in this runtime
  | 'unknown'

export interface MicFailure {
  reason: MicFailureReason
  /** One-line headline for the user. */
  title: string
  /** Ordered, platform-specific steps to fix it. May be empty. */
  steps: string[]
  /** Whether offering a "Try again" button makes sense. */
  canRetry: boolean
}

/** True for the shells where the fix is in OS settings, not site settings. */
export function isNativeHost(host: MicHost): boolean {
  return host === 'android-app' || host === 'ios-app'
}

/** Steps for turning the microphone back on, for this specific shell. */
export function permissionStepsFor(host: MicHost): string[] {
  switch (host) {
    case 'android-app':
      return [
        'Open your phone’s Settings app',
        'Go to Apps → MyNotes → Permissions',
        'Tap Microphone and choose Allow',
        'Come back here and tap Try again',
      ]
    case 'ios-app':
      return [
        'Open your phone’s Settings app',
        'Scroll down and tap MyNotes',
        'Turn Microphone on',
        'Come back here and tap Try again',
      ]
    case 'chrome':
    case 'edge':
      return [
        'Click the icon at the left of the address bar (a padlock, sliders, or a crossed-out microphone)',
        'Find Microphone and set it to Allow',
        'Reload the page, then tap Try again',
      ]
    case 'firefox':
      return [
        'Click the padlock at the left of the address bar',
        'Under Permissions, clear the blocked Microphone setting',
        'Reload the page, then tap Try again',
      ]
    case 'safari':
      return [
        'Open Safari → Settings → Websites → Microphone',
        'Set this site to Allow',
        'Reload the page, then tap Try again',
      ]
    default:
      return [
        'Open your browser’s site settings for this page',
        'Set Microphone to Allow',
        'Reload the page, then tap Try again',
      ]
  }
}

/**
 * Turns a getUserMedia error name into something a user can act on.
 *
 * Takes the error *name* rather than the error object so this stays
 * testable without constructing DOMExceptions. The names are the standard
 * ones from the Media Capture spec plus the older prefixed spellings some
 * browsers still throw; anything unrecognized falls through to 'unknown'
 * rather than being guessed at.
 */
export function classifyMicError(errorName: string, host: MicHost): MicFailure {
  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || errorName === 'SecurityError') {
    // Covers both "the user chose Block" and "an embedding host refused on
    // the user's behalf". Those need different fixes, but nothing in the
    // error distinguishes them, so the wording has to cover both rather
    // than asserting which one happened.
    return {
      reason: 'denied',
      title: 'MyNotes needs permission to use your microphone',
      steps: permissionStepsFor(host),
      canRetry: true,
    }
  }

  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError' || errorName === 'OverconstrainedError') {
    return {
      reason: 'no-device',
      title: 'No microphone found on this device',
      steps: isNativeHost(host)
        ? ['Check that nothing is covering the microphone', 'If a headset is connected, try unplugging it']
        : ['Plug in or switch on a microphone', 'If you just connected one, reload the page and try again'],
      canRetry: true,
    }
  }

  if (errorName === 'NotReadableError' || errorName === 'TrackStartError' || errorName === 'AbortError') {
    return {
      reason: 'in-use',
      title: 'Your microphone is being used by something else',
      steps: ['Close any other app or tab that might be recording or on a call', 'Then tap Try again'],
      canRetry: true,
    }
  }

  return {
    reason: 'unknown',
    title: 'Couldn’t start recording',
    steps: ['Tap Try again', 'If it keeps failing, restart the app and try once more'],
    canRetry: true,
  }
}

/** Failure shown when the runtime has no getUserMedia/MediaRecorder at all. */
export function unsupportedFailure(host: MicHost): MicFailure {
  return {
    reason: 'unsupported',
    title: 'This app can’t record audio here',
    steps: isNativeHost(host)
      ? ['Update the app to the latest version and try again']
      : ['Try Chrome, Edge, or Safari on a device with a microphone'],
    canRetry: false,
  }
}

/** Failure shown when the page isn't on a secure origin. */
export function insecureContextFailure(): MicFailure {
  return {
    reason: 'insecure-context',
    title: 'Recording needs a secure (https) connection',
    steps: ['Open this app over https:// rather than http://'],
    canRetry: false,
  }
}

/**
 * Best audio container to ask MediaRecorder for, most-preferred first.
 *
 * Kept here (rather than inline in the recorder) so the ordering is
 * testable against a stub support-check. It matters downstream: the blob
 * goes to Deepgram for transcription, and MediaRecorder silently
 * substitutes its own default for an unsupported mimeType — and Android's
 * WebView does not default to the same container as desktop Chrome.
 */
export const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4', // Safari, and some Android WebViews
  'audio/mpeg',
] as const

export function pickAudioMimeType(isSupported: (type: string) => boolean): string | undefined {
  return AUDIO_MIME_CANDIDATES.find((type) => isSupported(type))
}
