import { useEffect, useRef, useState } from 'react'
import {
  getMeeting,
  updateMeeting,
  deleteMeeting,
  listSuggestionsForMeeting,
  updateSuggestionStatus,
  createDecision,
  createActionItem,
  listDecisionsForMeeting,
  listActionItemsForMeeting,
  type LocalMeeting,
  type LocalSuggestion,
  type LocalDecision,
  type LocalActionItem,
} from '../lib/db'
import { requestMeetingTranscription } from '../lib/transcribe'
import { requestMeetingAnalysis } from '../lib/analyze'
import { hasMeetingMinutesContent } from '../lib/meetingMinutes'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { formatDuration } from '../lib/format'
import { IconBack, IconClose } from '../components/icons'

interface MeetingViewProps {
  meetingId: string
  onBack: () => void
  onDeleted: () => void
  onOpenMinutes: () => void
}

type Status = 'loading' | 'ready' | 'not-found'

export default function MeetingView({ meetingId, onBack, onDeleted, onOpenMinutes }: MeetingViewProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [meeting, setMeeting] = useState<LocalMeeting | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [agenda, setAgenda] = useState('')
  const [participantNames, setParticipantNames] = useState<string[]>([])
  const [participantDraft, setParticipantDraft] = useState('')
  const [suggestions, setSuggestions] = useState<LocalSuggestion[]>([])
  const [decisions, setDecisions] = useState<LocalDecision[]>([])
  const [actionItems, setActionItems] = useState<LocalActionItem[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const triedTranscribe = useRef(false)

  async function reloadSuggestionsAndOutcomes() {
    const [s, d, a] = await Promise.all([
      listSuggestionsForMeeting(meetingId),
      listDecisionsForMeeting(meetingId),
      listActionItemsForMeeting(meetingId),
    ])
    setSuggestions(s)
    setDecisions(d)
    setActionItems(a)
  }

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
    void reloadSuggestionsAndOutcomes()
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

  async function handleAnalyze() {
    setAnalyzing(true)
    setAnalyzeError(null)
    const result = await requestMeetingAnalysis(meetingId)
    setAnalyzing(false)
    if (!result.ok) {
      setAnalyzeError(result.message)
      return
    }
    await reloadSuggestionsAndOutcomes()
  }

  async function handleApprove(suggestion: LocalSuggestion) {
    if (suggestion.payload.kind === 'summary') {
      await updateMeeting(meetingId, { summary: suggestion.payload.text })
      const refreshed = await getMeeting(meetingId)
      if (refreshed) setMeeting(refreshed)
    } else if (suggestion.payload.kind === 'decision') {
      await createDecision({
        meetingId,
        text: suggestion.payload.text,
        context: suggestion.payload.context,
        createdFromSuggestionId: suggestion.id,
      })
    } else if (suggestion.payload.kind === 'action') {
      await createActionItem({
        title: suggestion.payload.title,
        owner: suggestion.payload.owner,
        dueDate: suggestion.payload.dueDate,
        sourceMeetingId: meetingId,
        confidence: suggestion.confidence,
        createdFromSuggestionId: suggestion.id,
      })
    }
    await updateSuggestionStatus(suggestion.id, 'approved')
    await reloadSuggestionsAndOutcomes()
  }

  async function handleIgnore(suggestion: LocalSuggestion) {
    await updateSuggestionStatus(suggestion.id, 'ignored')
    await reloadSuggestionsAndOutcomes()
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

      {meeting.status === 'ready' &&
        meeting.transcript &&
        (suggestions.length === 0 || suggestions.some((s) => s.status === 'pending')) && (
        <div>
          <p className="section-label">AI suggestions</p>

          {suggestions.length === 0 && (
            <>
              <button className="analyze-btn" type="button" onClick={() => void handleAnalyze()} disabled={analyzing}>
                {analyzing ? 'Analyzing…' : 'Analyze meeting'}
              </button>
              <p className="muted" style={{ marginTop: 8 }}>
                Reads the transcript and suggests a summary, decisions, and action items for you to approve —
                nothing is added until you say so.
              </p>
              {analyzeError && <p className="muted">{analyzeError}</p>}
            </>
          )}

          {suggestions.filter((s) => s.status === 'pending').length > 0 && (
            <div className="list">
              {suggestions
                .filter((s) => s.status === 'pending')
                .map((s) => (
                  <div key={s.id} className="suggestion-card">
                    <p className="suggestion-text">
                      {s.payload.kind === 'summary' && s.payload.text}
                      {s.payload.kind === 'decision' && s.payload.text}
                      {s.payload.kind === 'action' &&
                        `${s.payload.title}${s.payload.owner ? ` — ${s.payload.owner}` : ''}${
                          s.payload.dueDate ? ` (due ${s.payload.dueDate})` : ''
                        }`}
                    </p>
                    <span className="suggestion-kind">
                      {s.payload.kind === 'summary' ? 'Summary' : s.payload.kind === 'decision' ? 'Decision' : 'Action item'}
                    </span>
                    <div className="suggestion-actions">
                      <button type="button" className="suggestion-approve" onClick={() => void handleApprove(s)}>
                        Approve
                      </button>
                      <button type="button" className="suggestion-ignore" onClick={() => void handleIgnore(s)}>
                        Ignore
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {hasMeetingMinutesContent({ meeting, decisions, actionItems }) && (
        <button className="analyze-btn" type="button" onClick={onOpenMinutes}>
          View meeting minutes
        </button>
      )}

      {meeting.summary && (
        <div>
          <p className="section-label">Summary</p>
          <p className="transcript-text">{meeting.summary}</p>
        </div>
      )}

      {decisions.length > 0 && (
        <div>
          <p className="section-label">Decisions</p>
          <div className="group">
            {decisions.map((d) => (
              <div key={d.id} className="row" style={{ cursor: 'default' }}>
                <span className="t">{d.text}</span>
                {d.context && <span className="m">{d.context}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {actionItems.length > 0 && (
        <div>
          <p className="section-label">Action items</p>
          <div className="group">
            {actionItems.map((a) => (
              <div key={a.id} className="row" style={{ cursor: 'default' }}>
                <span className="t">{a.title}</span>
                <span className="m">
                  {[a.owner, a.dueDate].filter(Boolean).join(' · ') || 'Unassigned'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="delete-btn" type="button" onClick={handleDelete}>
        Delete meeting
      </button>
    </div>
  )
}
