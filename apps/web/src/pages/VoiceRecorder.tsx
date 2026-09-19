import { useCallback, useEffect, useRef, useState } from 'react'
import { createVoiceNote } from '../lib/db'
import { IconClose, IconStop } from '../components/icons'
import { formatDuration } from '../lib/format'
import { detectHost, getMicPermissionState, preferredAudioMimeType, requestMicrophone } from '../lib/microphone'
import { classifyMicError, type MicFailure } from '../lib/micGuidance'
import MicPermissionNotice from '../components/MicPermissionNotice'

interface VoiceRecorderProps {
  onSaved: (voiceNoteId: string) => void
  onCancel: () => void
}

type Phase = 'checking' | 'needs-permission' | 'requesting' | 'recording' | 'saving' | 'failed'

export default function VoiceRecorder({ onSaved, onCancel }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [failure, setFailure] = useState<MicFailure | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)
  // Guards against a late getUserMedia resolution touching state after the
  // screen has already been closed.
  const cancelledRef = useRef(false)

  const beginRecording = useCallback(async () => {
    setPhase('requesting')
    setFailure(null)

    const result = await requestMicrophone()
    if (cancelledRef.current) {
      if (result.ok) result.stream.getTracks().forEach((t) => t.stop())
      return
    }
    if (!result.ok) {
      setFailure(result.failure)
      setPhase('failed')
      return
    }

    streamRef.current = result.stream
    // Ask for a container explicitly rather than taking MediaRecorder's
    // default, which differs between desktop Chrome and Android's WebView
    // — the blob goes on to Deepgram, so its type can't be a surprise.
    const mimeType = preferredAudioMimeType()
    const recorder = mimeType ? new MediaRecorder(result.stream, { mimeType }) : new MediaRecorder(result.stream)
    mediaRecorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start()
    startedAtRef.current = Date.now()
    setPhase('recording')
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 250)
  }, [])

  useEffect(() => {
    cancelledRef.current = false

    // Check the stored permission first. When it's already 'denied',
    // calling getUserMedia would fail instantly with no prompt, so showing
    // the settings steps straight away is both faster and more accurate
    // than making the user tap a button that can't succeed. 'unknown'
    // (Firefox, older Safari) falls through to just trying.
    void (async () => {
      const state = await getMicPermissionState()
      if (cancelledRef.current) return
      if (state === 'denied') {
        setFailure(classifyMicError('NotAllowedError', detectHost()))
        setPhase('needs-permission')
        return
      }
      await beginRecording()
    })()

    return () => {
      cancelledRef.current = true
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [beginRecording])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  async function handleStop() {
    const recorder = mediaRecorderRef.current
    if (!recorder || phase !== 'recording') return
    setPhase('saving')

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    recorder.stop()
    await stopped
    stopStream()

    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    const voiceNote = await createVoiceNote({ audioBlob: blob, durationSeconds })
    onSaved(voiceNote.id)
  }

  function handleCancel() {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    stopStream()
    onCancel()
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" type="button" onClick={handleCancel} aria-label="Cancel">
          <IconClose size={16} />
        </button>
      </div>

      <div className="recorder-body">
        {(phase === 'needs-permission' || phase === 'failed') && failure && (
          <MicPermissionNotice failure={failure} onRetry={() => void beginRecording()} />
        )}

        {phase === 'checking' && <p className="muted">Checking microphone…</p>}
        {phase === 'requesting' && <p className="muted">Requesting microphone access…</p>}

        {(phase === 'recording' || phase === 'saving') && (
          <>
            <div className="rec-indicator">
              <span className="rec-dot" />
              <span>{phase === 'saving' ? 'Saving…' : 'Recording'}</span>
            </div>
            <p className="rec-timer">{formatDuration(elapsed)}</p>
            <button
              className="rec-stop-btn"
              type="button"
              onClick={handleStop}
              disabled={phase === 'saving'}
              aria-label="Stop and save"
            >
              <IconStop size={26} />
            </button>
            <p className="muted">Tap to stop and save</p>
          </>
        )}
      </div>
    </div>
  )
}
