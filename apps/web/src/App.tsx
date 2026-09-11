import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './lib/supabaseClient'
import { syncNow, watchConnectivity } from './lib/sync'
import { createNote } from './lib/db'
import CaptureSheet from './components/CaptureSheet'
import Home from './pages/Home'
import Login from './pages/Login'
import NoteEditor from './pages/NoteEditor'
import Notes from './pages/Notes'
import VoiceRecorder from './pages/VoiceRecorder'
import VoiceNoteView from './pages/VoiceNoteView'
import MeetingRecorder from './pages/MeetingRecorder'
import MeetingView from './pages/MeetingView'

type View =
  | { name: 'home' }
  | { name: 'notes' }
  | { name: 'editor'; noteId: string; from: 'home' | 'notes' }
  | { name: 'record'; from: 'home' | 'notes' }
  | { name: 'voice'; voiceNoteId: string; from: 'home' | 'notes' }
  | { name: 'record-meeting'; from: 'home' | 'notes' }
  | { name: 'meeting'; meetingId: string; from: 'home' | 'notes' }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [view, setView] = useState<View>({ name: 'home' })
  const [captureOpen, setCaptureOpen] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setChecked(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    watchConnectivity()
    void syncNow()
  }, [session])

  if (!checked) return null

  if (isSupabaseConfigured && !session) {
    return <Login />
  }

  function captureFrom(): 'home' | 'notes' {
    return view.name === 'notes' ? 'notes' : 'home'
  }

  async function handleTextNoteCapture() {
    const from = captureFrom()
    const note = await createNote({ title: '', content: '' })
    setCaptureOpen(false)
    setView({ name: 'editor', noteId: note.id, from })
  }

  function handleVoiceNoteCapture() {
    const from = captureFrom()
    setCaptureOpen(false)
    setView({ name: 'record', from })
  }

  function handleMeetingCapture() {
    const from = captureFrom()
    setCaptureOpen(false)
    setView({ name: 'record-meeting', from })
  }

  function backTo(from: 'home' | 'notes') {
    setView(from === 'notes' ? { name: 'notes' } : { name: 'home' })
  }

  function backFromEditor() {
    if (view.name === 'editor') backTo(view.from)
  }

  function backFromVoice() {
    if (view.name === 'voice') backTo(view.from)
  }

  function backFromMeeting() {
    if (view.name === 'meeting') backTo(view.from)
  }

  return (
    <>
      {view.name === 'home' && (
        <Home
          onOpenNote={(id) => setView({ name: 'editor', noteId: id, from: 'home' })}
          onOpenVoiceNote={(id) => setView({ name: 'voice', voiceNoteId: id, from: 'home' })}
          onOpenMeeting={(id) => setView({ name: 'meeting', meetingId: id, from: 'home' })}
          onOpenNotesList={() => setView({ name: 'notes' })}
          onCapture={() => setCaptureOpen(true)}
        />
      )}

      {view.name === 'notes' && (
        <Notes
          onBack={() => setView({ name: 'home' })}
          onOpenNote={(id) => setView({ name: 'editor', noteId: id, from: 'notes' })}
          onCapture={() => setCaptureOpen(true)}
        />
      )}

      {view.name === 'editor' && (
        <NoteEditor noteId={view.noteId} onBack={backFromEditor} onDeleted={backFromEditor} />
      )}

      {view.name === 'record' && (
        <VoiceRecorder
          onSaved={(id) => setView({ name: 'voice', voiceNoteId: id, from: view.from })}
          onCancel={() => backTo(view.from)}
        />
      )}

      {view.name === 'voice' && (
        <VoiceNoteView voiceNoteId={view.voiceNoteId} onBack={backFromVoice} onDeleted={backFromVoice} />
      )}

      {view.name === 'record-meeting' && (
        <MeetingRecorder
          onSaved={(id) => setView({ name: 'meeting', meetingId: id, from: view.from })}
          onCancel={() => backTo(view.from)}
        />
      )}

      {view.name === 'meeting' && (
        <MeetingView meetingId={view.meetingId} onBack={backFromMeeting} onDeleted={backFromMeeting} />
      )}

      {captureOpen && (
        <CaptureSheet
          onClose={() => setCaptureOpen(false)}
          onTextNote={() => void handleTextNoteCapture()}
          onVoiceNote={handleVoiceNoteCapture}
          onMeeting={handleMeetingCapture}
        />
      )}
    </>
  )
}
