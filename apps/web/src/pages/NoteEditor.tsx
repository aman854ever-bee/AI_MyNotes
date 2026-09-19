import { useEffect, useRef, useState } from 'react'
import { getNote, updateNote, deleteNote, type LocalNote } from '../lib/db'
import { relativeDate } from '../lib/format'
import {
  IconBack,
  IconClose,
  IconBold,
  IconItalic,
  IconList,
  IconCheckSquare,
  IconLink,
} from '../components/icons'

interface NoteEditorProps {
  noteId: string
  onBack: () => void
  onDeleted: () => void
}

type Status = 'loading' | 'ready' | 'not-found'
type SaveState = 'saved' | 'saving'

/** What each toolbar button does to the current selection. */
type Format = 'bold' | 'italic' | 'list' | 'checklist' | 'link'

export default function NoteEditor({ noteId, onBack, onDeleted }: NoteEditorProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)

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
      setUpdatedAt(n.updatedAt)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [noteId])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  function scheduleSave(patch: Partial<{ title: string; content: string }>) {
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void updateNote(noteId, patch).then(() => {
        setSaveState('saved')
        setUpdatedAt(new Date().toISOString())
      })
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

  /**
   * The design shows a rich-text toolbar. Notes are stored as plain text, so
   * rather than pull in an editor library (and change the storage format),
   * these wrap the selection in Markdown — which round-trips through the
   * existing schema and stays readable if it's ever rendered elsewhere.
   */
  function applyFormat(format: Format) {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.slice(start, end)
    let replacement: string
    let caretOffset: number

    if (format === 'bold' || format === 'italic') {
      const marker = format === 'bold' ? '**' : '*'
      replacement = `${marker}${selected || (format === 'bold' ? 'bold text' : 'italic text')}${marker}`
      caretOffset = marker.length
    } else {
      const prefix = format === 'list' ? '- ' : format === 'checklist' ? '- [ ] ' : ''
      if (format === 'link') {
        replacement = `[${selected || 'link text'}](url)`
        caretOffset = 1
      } else {
        const lines = (selected || 'List item').split('\n')
        replacement = lines.map((line) => `${prefix}${line}`).join('\n')
        caretOffset = prefix.length
      }
    }

    const next = content.slice(0, start) + replacement + content.slice(end)
    handleContentChange(next)
    // Put the caret back where the writer expects it: inside the markers when
    // nothing was selected, after the inserted text when something was.
    requestAnimationFrame(() => {
      el.focus()
      const pos = selected ? start + replacement.length : start + caretOffset
      const endPos = selected ? pos : pos + (replacement.length - caretOffset * 2 > 0 ? replacement.length - caretOffset * 2 : 0)
      el.setSelectionRange(pos, selected ? pos : endPos)
    })
  }

  function addTag() {
    const t = tagDraft.trim().toLowerCase()
    setTagDraft('')
    setAddingTag(false)
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

  async function handleShare() {
    const text = `${title || 'Untitled'}\n\n${content}`.trim()
    // Native share sheet where the platform has one; clipboard everywhere
    // else, so the button always does something real.
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Untitled note', text })
        return
      } catch {
        // Dismissed or unavailable — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareNote('Copied to clipboard')
      window.setTimeout(() => setShareNote(null), 2500)
    } catch {
      setShareNote("Couldn't share this note")
      window.setTimeout(() => setShareNote(null), 2500)
    }
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
      <div className="m-screen">
        <div className="verify-header">
          <button type="button" className="verify-back-btn" onClick={onBack} aria-label="Back">
            <IconBack size={20} />
          </button>
          <h1>Note</h1>
        </div>
        <div className="m-empty">
          <p>This note is gone.</p>
          <p className="sub">It may have been deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="m-screen m-screen-editor">
      <div className="m-header">
        <button type="button" className="verify-back-btn" onClick={handleDone} aria-label="Back">
          <IconBack size={20} />
        </button>
        <div className="m-heading">
          <h1>Edit note</h1>
        </div>
        <button type="button" className="m-header-action" onClick={() => void handleShare()}>
          Share
        </button>
      </div>

      <div className="m-save-state">
        <span className={saveState === 'saved' ? 'm-save-pill saved' : 'm-save-pill'}>
          {saveState === 'saved' ? '● Saved' : '● Saving…'}
        </span>
        <span className="m-save-time">
          {shareNote ?? (updatedAt ? `Updated ${relativeDate(updatedAt)}` : '')}
        </span>
      </div>

      <div className="m-editor">
        <input
          className="m-editor-title"
          placeholder="Untitled"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
        />

        <div className="m-chips m-chips-tags">
          {tags.map((tag) => (
            <span key={tag} className="m-chip m-chip-tag">
              #{tag}
              <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>
                <IconClose size={10} />
              </button>
            </span>
          ))}
          {addingTag ? (
            <input
              className="m-chip m-tag-input"
              placeholder="tag"
              value={tagDraft}
              autoFocus
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
                if (e.key === 'Escape') {
                  setTagDraft('')
                  setAddingTag(false)
                }
              }}
              onBlur={addTag}
            />
          ) : (
            <button type="button" className="m-chip" onClick={() => setAddingTag(true)}>
              + Tag
            </button>
          )}
        </div>

        <textarea
          ref={contentRef}
          className="m-editor-body"
          placeholder="Start writing…"
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
        />
      </div>

      <div className="m-toolbar">
        <button type="button" onClick={() => applyFormat('bold')} aria-label="Bold">
          <IconBold size={18} />
        </button>
        <button type="button" onClick={() => applyFormat('italic')} aria-label="Italic">
          <IconItalic size={18} />
        </button>
        <button type="button" onClick={() => applyFormat('list')} aria-label="Bullet list">
          <IconList size={18} />
        </button>
        <button type="button" onClick={() => applyFormat('checklist')} aria-label="Checklist">
          <IconCheckSquare size={18} />
        </button>
        <button type="button" onClick={() => applyFormat('link')} aria-label="Link">
          <IconLink size={18} />
        </button>
      </div>

      {/* The design also has an image button and a "Set reminder" row. Both
          need backends this app doesn't have yet (attachment storage for
          notes, and scheduled reminders), so they're left out rather than
          shipped as controls that do nothing. */}

      <button className="m-danger-link" type="button" onClick={() => void handleDelete()}>
        Delete note
      </button>
    </div>
  )
}
