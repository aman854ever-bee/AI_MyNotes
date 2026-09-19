import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './lib/supabaseClient'
import { syncNow, watchConnectivity } from './lib/sync'
import { createNote } from './lib/db'
import CaptureSheet from './components/CaptureSheet'
import AppShell, { type Section } from './components/AppShell'
import Home from './pages/Home'
import Login from './pages/Login'
import NoteEditor from './pages/NoteEditor'
import Notes from './pages/Notes'
import Calendar from './pages/Calendar'
import AskAI from './pages/AskAI'
import Profile from './pages/Profile'
import VoiceRecorder from './pages/VoiceRecorder'
import VoiceNoteView from './pages/VoiceNoteView'
import MeetingRecorder from './pages/MeetingRecorder'
import MeetingView from './pages/MeetingView'
import MeetingMinutes from './pages/MeetingMinutes'
import CalendarSettings from './pages/CalendarSettings'
import { captureLinkedCalendarTokens } from './lib/calendar'
import { registerOAuthDeepLinkListener } from './lib/capacitorAuth'

type View =
  | { name: 'section'; section: Section }
  | { name: 'editor'; noteId: string; from: Section }
  | { name: 'record'; from: Section }
  | { name: 'voice'; voiceNoteId: string; from: Section }
  | { name: 'record-meeting'; from: Section }
  | { name: 'meeting'; meetingId: string; from: Section }
  | { name: 'meeting-minutes'; meetingId: string; from: Section }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [view, setView] = useState<View>({ name: 'section', section: 'home' })
  const [captureOpen, setCaptureOpen] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setChecked(true)
      return
    }
    // Native-only (spike/capacitor-oauth): completes the OAuth round-trip
    // from a deep-link callback instead of a WebView redirect — see
    // lib/capacitorAuth.ts. No-op on web.
    registerOAuthDeepLinkListener()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) void captureLinkedCalendarTokens(nextSession)
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

  function captureFrom(): Section {
    return view.name === 'section' ? view.section : 'home'
  }

  // The name the dashboard greets you by. Supabase puts a display name in
  // user_metadata for Google sign-ins but not for phone/email OTP, so fall
  // back to the email's local part, then to no name at all (the greeting
  // reads fine without one) rather than showing a raw phone number.
  const userName = (() => {
    const meta = session?.user?.user_metadata as { full_name?: string; name?: string } | undefined
    const full = meta?.full_name ?? meta?.name
    if (full) return full.split(' ')[0]
    const email = session?.user?.email
    if (email) return email.split('@')[0]
    return ''
  })()

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

  function goToSection(section: Section) {
    setView({ name: 'section', section })
  }

  function backTo(from: Section) {
    setView({ name: 'section', section: from })
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

  if (view.name === 'section') {
    return (
      <>
        <AppShell active={view.section} onNavigate={goToSection}>
          {view.section === 'home' && (
            <Home
              userName={userName}
              onOpenNote={(id) => setView({ name: 'editor', noteId: id, from: 'home' })}
              onOpenVoiceNote={(id) => setView({ name: 'voice', voiceNoteId: id, from: 'home' })}
              onOpenMeeting={(id) => setView({ name: 'meeting', meetingId: id, from: 'home' })}
              onOpenNotesList={() => goToSection('notes')}
              onOpenMeetingsList={() => goToSection('meetings')}
              onNewNote={() => void handleTextNoteCapture()}
              onNewVoiceNote={handleVoiceNoteCapture}
              onNewMeeting={handleMeetingCapture}
            />
          )}

          {view.section === 'notes' && (
            <Notes
              onOpenNote={(id) => setView({ name: 'editor', noteId: id, from: 'notes' })}
              onOpenVoiceNote={(id) => setView({ name: 'voice', voiceNoteId: id, from: 'notes' })}
              onOpenMeeting={(id) => setView({ name: 'meeting', meetingId: id, from: 'notes' })}
              onNewNote={() => void handleTextNoteCapture()}
            />
          )}

          {view.section === 'meetings' && <Calendar onOpenConnect={() => goToSection('connect')} />}

          {view.section === 'ai' && (
            <AskAI
              onOpenMeeting={(id) => setView({ name: 'meeting', meetingId: id, from: 'ai' })}
              onOpenMeetingsList={() => goToSection('meetings')}
            />
          )}

          {view.section === 'connect' && <CalendarSettings />}
          {view.section === 'profile' && (
            <Profile session={session} onOpenConnect={() => goToSection('connect')} />
          )}
        </AppShell>

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

  return (
    <>
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
        <MeetingView
          meetingId={view.meetingId}
          onBack={backFromMeeting}
          onDeleted={backFromMeeting}
          onOpenMinutes={() => setView({ name: 'meeting-minutes', meetingId: view.meetingId, from: view.from })}
        />
      )}

      {view.name === 'meeting-minutes' && (
        <MeetingMinutes
          meetingId={view.meetingId}
          onBack={() => setView({ name: 'meeting', meetingId: view.meetingId, from: view.from })}
        />
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
