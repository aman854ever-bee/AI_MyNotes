import { useEffect, useRef, useState } from 'react'
import { getVoiceNote, deleteVoiceNote, type LocalVoiceNote } from '../lib/db'
import { requestTranscription } from '../lib/transcribe'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { formatDuration } from '../lib/format'
import { IconBack } from '../components/icons'

interface VoiceNoteViewProps {
  voiceNoteId: string
  onBack: () => void
  onDeleted: () => void
}

type Status = 'loading' | 'ready' | 'not-found'

export default function VoiceNoteView({ voiceNoteId, onBack, onDeleted }: VoiceNoteViewProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [voiceNote, setVoiceNote] = useState<LocalVoiceNote | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const triedTranscribe = useRef(false)

  useEffect(() => {
    let cancelled = false
    getVoiceNote(voiceNoteId).then((v) => {
      if (cancelled) return
      if (!v) {
        setStatus('not-found')
        return
      }
      setVoiceNote(v)
      setStatus('ready')
      if (v.audioBlob) {
        setAudioUrl(URL.createObjectURL(v.audioBlob))
      }
    })
    return () => {
      cancelled = true
    }
  }, [voiceNoteId])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    if (!voiceNote || triedTranscribe.current) return
    if (!isSupabaseConfigured) return
    if (voiceNote.status === 'ready' || voiceNote.status === 'transcribing') return
    triedTranscribe.current = true
    void requestTranscription(voiceNote.id).then(() => {
      void getVoiceNote(voiceNote.id).then((v) => v && setVoiceNote(v))
    })
  }, [voiceNote])

  async function handleDelete() {
    await deleteVoiceNote(voiceNoteId)
    onDeleted()
  }

  if (status === 'loading') return null

  if (status === 'not-found' || !voiceNote) {
    return (
      <div className="page">
        <div className="topbar">
          <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
            <IconBack />
          </button>
        </div>
        <div className="empty-state">
          <p>This voice note is gone.</p>
          <p className="muted">It may have been deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
          <IconBack />
        </button>
      </div>

      <div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 22, margin: 0 }}>Voice note</h1>
        <p className="meta">
          {new Date(voiceNote.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {' · '}
          {formatDuration(voiceNote.durationSeconds)}
        </p>
      </div>

      {audioUrl ? (
        <audio className="audio-player" src={audioUrl} controls />
      ) : (
        <p className="muted">Recorded on another device — audio isn&apos;t downloaded here yet.</p>
      )}

      <div>
        <p className="section-label">Transcript</p>
        {voiceNote.status === 'ready' && voiceNote.transcript && (
          <p className="transcript-text">{voiceNote.transcript}</p>
        )}
        {voiceNote.status === 'ready' && !voiceNote.transcript && (
          <p className="muted">Deepgram didn&apos;t return any speech for this recording.</p>
        )}
        {voiceNote.status === 'transcribing' && <p className="muted">Transcribing…</p>}
        {voiceNote.status === 'error' && (
          <p className="muted">Transcription failed. It&apos;ll retry automatically next time this note opens.</p>
        )}
        {voiceNote.status === 'recorded' && !isSupabaseConfigured && (
          <div className="banner">
            Connect Supabase and Deepgram to get a transcript — see <code>apps/web/.env</code>. The recording is
            saved either way.
          </div>
        )}
      </div>

      <button className="delete-btn" type="button" onClick={handleDelete}>
        Delete voice note
      </button>
    </div>
  )
}
