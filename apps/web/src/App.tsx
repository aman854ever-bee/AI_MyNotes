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

type View =
  | { name: 'home' }
  | { name: 'notes' }
  | { name: 'editor'; noteId: string; from: 'home' | 'notes' }

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

  async function handleTextNoteCapture() {
    const from = view.name === 'notes' ? 'notes' : 'home'
    const note = await createNote({ title: '', content: '' })
    setCaptureOpen(false)
    setView({ name: 'editor', noteId: note.id, from })
  }

  function backFromEditor() {
    if (view.name === 'editor' && view.from === 'notes') {
      setView({ name: 'notes' })
    } else {
      setView({ name: 'home' })
    }
  }

  return (
    <>
      {view.name === 'home' && (
        <Home
          onOpenNote={(id) => setView({ name: 'editor', noteId: id, from: 'home' })}
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

      {captureOpen && (
        <CaptureSheet onClose={() => setCaptureOpen(false)} onTextNote={() => void handleTextNoteCapture()} />
      )}
    </>
  )
}
