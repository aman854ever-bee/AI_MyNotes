import { useEffect, useRef, useState } from 'react'
import { getMeeting, updateMeeting, deleteMeeting, type LocalMeeting } from '../lib/db'
import { requestMeetingTranscription } from '../lib/transcribe'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { formatDuration } from '../lib/format'
import { IconBack, IconClose } from '../components/icons'

interface MeetingViewProps {
  meetingId: string
  onBack: () => void
  onDeleted: () => void
}

type Status = 'loading' | 'ready' | 'not-found'

export default function MeetingView({ meetingId, onBack, onDeleted }: MeetingViewProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [meeting, setMeeting] = useState<LocalMeeting | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [agenda, setAgenda] = useState('')
  const [participantNames, setParticipantNames] = useState<string[]>([])
  const [participantDraft, setParticipantDraft] = useState('')
  const saveTimer = useRef<number | null>(null)
  const triedTranscribe = useRef(false)

  useEffect(() => {
    let cancelled = false
    getMeeting(meetingId).then((m) => {
      if (cancelled) return
      if (!m) {
        setStatus('not-found')
        return
      }
      setMeeting(m)
      setTitle(m.title)
      setAgenda(m.agenda ?? '')
      setParticipantNames(m.participantNames)
      setStatus('ready')
      if (m.audioBlob) setAudioUrl(URL.createObjectURL(m.audioBlob))
    })
    return () => {
      cancelled = true
    }
  }, [meetingId])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    if (!meeting || triedTranscribe.current) return
    if (!isSupabaseConfigured) return
    if (meeting.status === 'ready' || meeting.status === 'transcribing') return
    triedTranscribe.current = true
    void requestMeetingTranscription(meeting.id).then(() => {
      void getMeeting(meeting.id).then((m) => m && setMeeting(m))
    })
  }, [meeting])

  function scheduleSave(patch: Partial<{ title: string; agenda: string }>) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void updateMeeting(meetingId, patch)
    }, 500)
  }

  function handleTitleChange(value: string) {
    setTitle(value)
    scheduleSave({ title: value })
  }

  function handleAgendaChange(value: string) {
    setAgenda(value)
    scheduleSave({ agenda: value })
  }

  function addParticipant() {
    const name = participantDraft.trim()
    setParticipantDraft('')
    if (!name || participantNames.includes(name)) return
    const next = [...participantNames, name]
    setParticipantNames(next)
    void updateMeeting(meetingId, { participantNames: next })
  }

  function removeParticipant(name: string) {
    const next = participantNames.filter((n) => n !== name)
    setParticipantNames(next)
    void updateMeeting(meetingId, { participantNames: next })
  }

  async function handleDelete() {
    await deleteMeeting(meetingId)
    onDeleted()
  }

  function handleDone() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      void updateMeeting(meetingId, { title, agenda })
    }
    onBack()
  }

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

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" type="button" onClick={handleDone} aria-label="Back">
          <IconBack />
        </button>
        <button className="save-btn" type="button" onClick={handleDone}>
          Done
        </button>
      </div>

      <input
        className="title-input"
        placeholder="Untitled meeting"
        value={title}
        autoFocus
        onChange={(e) => handleTitleChange(e.target.value)}
      />
      <p className="meta">
        {new Date(meeting.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        {' · '}
        {formatDuration(meeting.durationSeconds)}
      </p>

      {audioUrl ? (
        <audio className="audio-player" src={audioUrl} controls />
      ) : (
        <p className="muted">Recorded on another device — audio isn&apos;t downloaded here yet.</p>
      )}

      <textarea
        className="content-textarea"
        placeholder="Agenda or notes (optional)…"
        value={agenda}
        onChange={(e) => handleAgendaChange(e.target.value)}
        style={{ minHeight: 80 }}
      />

      <div>
        <p className="section-label">Participants</p>
        <div className="tags-row">
          {participantNames.map((name) => (
            <span key={name} className="tag">
              {name}
              <button type="button" onClick={() => removeParticipant(name)} aria-label={`Remove ${name}`}>
                <IconClose />
              </button>
            </span>
          ))}
          <input
            className="tag-input"
            placeholder="+ add participant"
            value={participantDraft}
            onChange={(e) => setParticipantDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addParticipant()
              }
            }}
            onBlur={addParticipant}
            style={{ width: 140 }}
          />
        </div>
      </div>

      <div>
        <p className="section-label">Transcript</p>
        {meeting.status === 'ready' && meeting.transcript && (
          <p className="transcript-text">{meeting.transcript}</p>
        )}
        {meeting.status === 'ready' && !meeting.transcript && (
          <p className="muted">Deepgram didn&apos;t return any speech for this recording.</p>
        )}
        {meeting.status === 'transcribing' && <p className="muted">Transcribing…</p>}
        {meeting.status === 'failed' && (
          <p className="muted">Transcription failed. It&apos;ll retry automatically next time this opens.</p>
        )}
        {meeting.status === 'stopped' && !isSupabaseConfigured && (
          <div className="banner">
            Connect Supabase and Deepgram to get a transcript — see <code>apps/web/.env</code>. The recording is
            saved either way.
          </div>
        )}
      </div>

      <button className="delete-btn" type="button" onClick={handleDelete}>
        Delete meeting
      </button>
    </div>
  )
}
