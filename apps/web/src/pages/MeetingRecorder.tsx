import { useEffect, useRef, useState } from 'react'
import { createMeeting } from '../lib/db'
import { IconClose, IconStop } from '../components/icons'
import { formatDuration } from '../lib/format'

interface MeetingRecorderProps {
  onSaved: (meetingId: string) => void
  onCancel: () => void
}

type Phase = 'requesting' | 'recording' | 'saving' | 'denied' | 'unsupported'

// Same capture flow as VoiceRecorder — title, agenda and participants are
// added afterwards on MeetingView, not before recording starts. A meeting
// starting now shouldn't wait on a form first.
export default function MeetingRecorder({ onSaved, onCancel }: MeetingRecorderProps) {
  const [phase, setPhase] = useState<Phase>('requesting')
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setPhase('unsupported')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const recorder = new MediaRecorder(stream)
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
      })
      .catch(() => {
        if (!cancelled) setPhase('denied')
      })

    return () => {
      cancelled = true
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

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
    const startedAt = new Date(startedAtRef.current).toISOString()
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    const meeting = await createMeeting({
      title: '',
      participantNames: [],
      audioBlob: blob,
      durationSeconds,
      startedAt,
      endedAt,
    })
    onSaved(meeting.id)
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
        {phase === 'unsupported' && (
          <div className="empty-state">
            <p>This browser can&apos;t record audio.</p>
            <p className="muted">Try Chrome, Edge, or Safari on a device with a microphone.</p>
          </div>
        )}

        {phase === 'denied' && (
          <div className="empty-state">
            <p>Microphone access was denied.</p>
            <p className="muted">Allow microphone access in your browser&apos;s site settings, then try again.</p>
          </div>
        )}

        {phase === 'requesting' && <p className="muted">Requesting microphone access…</p>}

        {(phase === 'recording' || phase === 'saving') && (
          <>
            <div className="rec-indicator">
              <span className="rec-dot" />
              <span>{phase === 'saving' ? 'Saving…' : 'Recording meeting'}</span>
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
            <p className="muted">Tap to stop and save · add participants after</p>
          </>
        )}
      </div>
    </div>
  )
}
