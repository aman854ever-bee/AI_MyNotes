import type { MicFailure } from '../lib/micGuidance'

interface MicPermissionNoticeProps {
  failure: MicFailure
  onRetry: () => void
  retrying?: boolean
}

/**
 * Shown on both recorder screens when the microphone can't be opened.
 *
 * Replaces the old flat "Microphone access was denied. Allow microphone
 * access in your browser's site settings" — which was shown for every
 * failure, was wrong for most of them, and on Android pointed at browser
 * settings that don't exist in a native app. The steps come from
 * lib/micGuidance.ts and are specific to both the failure and the platform.
 *
 * There is deliberately no "Open settings for me" button: opening the
 * Android app-settings screen from a Capacitor WebView needs a native
 * plugin the project doesn't have, and a button that silently does nothing
 * is worse than a clear instruction.
 */
export default function MicPermissionNotice({ failure, onRetry, retrying = false }: MicPermissionNoticeProps) {
  return (
    <div className="mic-notice" role="alert">
      <p className="mic-notice-title">{failure.title}</p>

      {failure.steps.length > 0 && (
        <ol className="mic-notice-steps">
          {failure.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      {failure.canRetry && (
        <button type="button" className="analyze-btn" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Checking…' : 'Try again'}
        </button>
      )}
    </div>
  )
}
