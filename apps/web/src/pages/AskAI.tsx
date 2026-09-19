import { useEffect, useState } from 'react'
import { listMeetings, type LocalMeeting } from '../lib/db'
import { relativeDate, formatDuration } from '../lib/format'
import { IconSparkle, IconMeeting } from '../components/icons'

interface AskAIProps {
  onOpenMeeting: (id: string) => void
  onOpenMeetingsList: () => void
}

/**
 * The AI tab. MyNotes' AI features are grounded in a specific meeting's
 * transcript — there is no free-floating assistant — so this tab's job is
 * to get you to the right transcript to ask about. Meetings without a
 * transcript are listed separately rather than hidden, because "why isn't
 * my meeting here?" is the obvious question otherwise.
 */
export default function AskAI({ onOpenMeeting, onOpenMeetingsList }: AskAIProps) {
  const [meetings, setMeetings] = useState<LocalMeeting[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    listMeetings().then((m) => {
      if (cancelled) return
      setMeetings(m)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const withTranscript = meetings.filter((m) => m.transcript && m.transcript.trim().length > 0)
  const withoutTranscript = meetings.filter((m) => !m.transcript || m.transcript.trim().length === 0)

  return (
    <div className="m-screen">
      <div className="m-header">
        <div className="m-heading">
          <h1>Ask AI</h1>
          <p className="m-subhead">Ask questions about anything you've recorded</p>
        </div>
      </div>

      {loaded && meetings.length === 0 && (
        <div className="m-empty">
          <p>Nothing to ask about yet.</p>
          <p className="sub">Record a meeting and AI can summarize it, pull out decisions, and answer questions about what was said.</p>
        </div>
      )}

      {withTranscript.length > 0 && (
        <>
          <div className="m-section-heading">
            <h2>Ready to ask</h2>
          </div>
          <div className="m-card">
            {withTranscript.map((meeting, i) => (
              <div key={meeting.id}>
                {i > 0 && <div className="m-divider" style={{ marginBottom: 10 }} />}
                <button type="button" className="m-list-item" onClick={() => onOpenMeeting(meeting.id)}>
                  <span className="m-list-icon">
                    <IconSparkle size={18} />
                  </span>
                  <span className="m-list-copy">
                    <span className="m-list-title">
                      {meeting.title || `Meeting · ${formatDuration(meeting.durationSeconds)}`}
                    </span>
                    <span className="m-list-sub">
                      {meeting.summary ? 'Summarized' : 'Transcript ready'} · {relativeDate(meeting.updatedAt)}
                    </span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {withoutTranscript.length > 0 && (
        <>
          <div className="m-section-heading">
            <h2>Not transcribed yet</h2>
            <button type="button" className="m-section-action" onClick={onOpenMeetingsList}>
              Meetings
            </button>
          </div>
          <div className="m-card">
            {withoutTranscript.slice(0, 4).map((meeting, i) => (
              <div key={meeting.id}>
                {i > 0 && <div className="m-divider" style={{ marginBottom: 10 }} />}
                <button type="button" className="m-list-item" onClick={() => onOpenMeeting(meeting.id)}>
                  <span className="m-list-icon">
                    <IconMeeting size={18} />
                  </span>
                  <span className="m-list-copy">
                    <span className="m-list-title">
                      {meeting.title || `Meeting · ${formatDuration(meeting.durationSeconds)}`}
                    </span>
                    <span className="m-list-sub">Open to transcribe · {relativeDate(meeting.updatedAt)}</span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
