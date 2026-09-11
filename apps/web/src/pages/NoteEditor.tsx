import { useEffect, useRef, useState } from 'react'
import { getNote, updateNote, deleteNote, type LocalNote } from '../lib/db'
import { IconBack, IconClose } from '../components/icons'

interface NoteEditorProps {
  noteId: string
  onBack: () => void
  onDeleted: () => void
}

type Status = 'loading' | 'ready' | 'not-found'

export default function NoteEditor({ noteId, onBack, onDeleted }: NoteEditorProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [createdAt, setCreatedAt] = useState<string>('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getNote(noteId).then((n: LocalNote | undefined) => {
      if (cancelled) return
      if (!n) {
        setStatus('not-found')
        return
      }
      setTitle(n.title)
      setContent(n.content)
      setTags(n.tags)
      setCreatedAt(n.createdAt)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [noteId])

  function scheduleSave(patch: Partial<{ title: string; content: string }>) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void updateNote(noteId, patch)
    }, 500)
  }

  function handleTitleChange(value: string) {
    setTitle(value)
    scheduleSave({ title: value })
  }

  function handleContentChange(value: string) {
    setContent(value)
    scheduleSave({ content: value })
  }

  function addTag() {
    const t = tagDraft.trim().toLowerCase()
    setTagDraft('')
    if (!t || tags.includes(t)) return
    const next = [...tags, t]
    setTags(next)
    void updateNote(noteId, { tags: next })
  }

  function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag)
    setTags(next)
    void updateNote(noteId, { tags: next })
  }

  async function handleDelete() {
    await deleteNote(noteId)
    onDeleted()
  }

  function handleDone() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      void updateNote(noteId, { title, content })
    }
    onBack()
  }

  if (status === 'loading') return null

  if (status === 'not-found') {
    return (
      <div className="page">
        <div className="topbar">
          <button className="icon-btn" type="button" onClick={onBack} aria-label="Back">
            <IconBack />
          </button>
        </div>
        <div className="empty-state">
          <p>This note is gone.</p>
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
        placeholder="Untitled"
        value={title}
        autoFocus
        onChange={(e) => handleTitleChange(e.target.value)}
      />
      <p className="meta">
        {new Date(createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>

      <textarea
        className="content-textarea"
        placeholder="Start writing…"
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
      />

      <div className="tags-row">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>
              <IconClose />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          placeholder="+ add tag"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          onBlur={addTag}
        />
      </div>

      <button className="delete-btn" type="button" onClick={handleDelete}>
        Delete note
      </button>
    </div>
  )
}
