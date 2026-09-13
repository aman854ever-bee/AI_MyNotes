import { useEffect, useState } from 'react'
import {
  getMeeting,
  listDecisionsForMeeting,
  listActionItemsForMeeting,
  type LocalMeeting,
  type LocalDecision,
  type LocalActionItem,
} from '../lib/db'
import { buildMeetingMinutesMarkdown, meetingMinutesFilename } from '../lib/meetingMinutes'
import { formatDuration } from '../lib/format'
import { IconBack } from '../components/icons'

interface MeetingMinutesProps {
  meetingId: string
  onBack: () => void
}

type Status = 'loading' | 'ready' | 'not-found'

export default function MeetingMinutes({ meetingId, onBack }: MeetingMinutesProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [meeting, setMeeting] = useState<LocalMeeting | null>(null)
  const [decisions, setDecisions] = useState<LocalDecision[]>([])
  const [actionItems, setActionItems] = useState<LocalActionItem[]>([])
  const [copyLabel, setCopyLabel] = useState('Copy')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [m, d, a] = await Promise.all([
        getMeeting(meetingId),
        listDecisionsForMeeting(meetingId),
        listActionItemsForMeeting(meetingId),
      ])
      if (cancelled) return
      if (!m) {
        setStatus('not-found')
        return
      }
      setMeeting(m)
      setDecisions(d)
      setActionItems(a)
      setStatus('ready')
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [meetingId])

  if (status === 'loading') return null

  if (status === 'not-found' || !meeting) {
    return (
      <div className="page">
        <div className="topbar">
          <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
            <IconBack />
          </button>
        </div>
        <div className="empty-state">
          <p>This meeting is gone.</p>
          <p className="muted">It may have been deleted.</p>
        </div>
      </div>
    )
  }

  const markdown = buildMeetingMinutesMarkdown({ meeting, decisions, actionItems })

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyLabel('Copied')
      window.setTimeout(() => setCopyLabel('Copy'), 1500)
    } catch {
      setCopyLabel('Couldn’t copy')
      window.setTimeout(() => setCopyLabel('Copy'), 1500)
    }
  }

  function handleDownload() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = meetingMinutesFilename(meeting!)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="page minutes-page">
      <div className="topbar minutes-no-print">
        <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
          <IconBack />
        </button>
        <div className="minutes-actions">
          <button className="minutes-action-btn" type="button" onClick={() => void handleCopy()}>
            {copyLabel}
          </button>
          <button className="minutes-action-btn" type="button" onClick={handleDownload}>
            Download
          </button>
          <button className="minutes-action-btn" type="button" onClick={handlePrint}>
            Print / PDF
          </button>
        </div>
      </div>

      <div className="minutes-doc">
        <p className="section-label minutes-no-print">Meeting minutes</p>
        <h1 className="minutes-title">{meeting.title.trim() || 'Untitled meeting'}</h1>
        <p className="meta">
          {new Date(meeting.startedAt ?? meeting.createdAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {meeting.durationSeconds ? ` · ${formatDuration(meeting.durationSeconds)}` : ''}
        </p>

        {meeting.participantNames.length > 0 && (
          <p className="minutes-attendees">
            <strong>Attendees:</strong> {meeting.participantNames.join(', ')}
          </p>
        )}

        {meeting.agenda && (
          <div className="minutes-section">
            <h2>Agenda</h2>
            <p className="transcript-text">{meeting.agenda}</p>
          </div>
        )}

        <div className="minutes-section">
          <h2>Summary</h2>
          {meeting.summary ? (
            <p className="transcript-text">{meeting.summary}</p>
          ) : (
            <p className="muted">No summary yet — analyze this meeting first to generate one.</p>
          )}
        </div>

        <div className="minutes-section">
          <h2>Decisions</h2>
          {decisions.length > 0 ? (
            <ul className="minutes-list">
              {decisions.map((d) => (
                <li key={d.id}>
                  {d.text}
                  {d.context && <span className="muted"> — {d.context}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No decisions recorded.</p>
          )}
        </div>

        <div className="minutes-section">
          <h2>Action items</h2>
          {actionItems.length > 0 ? (
            <ul className="minutes-list minutes-actions-list">
              {actionItems.map((a) => (
                <li key={a.id}>
                  <span className={`minutes-check${a.status === 'completed' ? ' done' : ''}`} aria-hidden="true" />
                  <span>
                    {a.title}
                    <span className="muted">
                      {' — '}
                      {[a.owner ?? 'Unassigned', a.dueDate ?? undefined, a.status !== 'pending' ? a.status.replace('_', ' ') : undefined]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No action items recorded.</p>
          )}
        </div>
      </div>
    </div>
  )
}
