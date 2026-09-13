import { useRef, useState } from 'react'
import { requestMeetingChatReply, type ChatMessage } from '../lib/chat'

interface MeetingChatProps {
  meetingId: string
}

// The primary way to get information out of a meeting: ask about it
// directly, rather than reading a generated document. A formal document is
// a separate, explicitly-triggered export (see MeetingMinutes) — this
// component never produces one itself.
export default function MeetingChat({ meetingId }: MeetingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  function scrollToEnd() {
    window.setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    }, 0)
  }

  async function handleSend() {
    const text = draft.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setDraft('')
    setError(null)
    setSending(true)
    scrollToEnd()

    const result = await requestMeetingChatReply(meetingId, next)
    setSending(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessages([...next, { role: 'assistant', content: result.reply }])
    scrollToEnd()
  }

  return (
    <div>
      <p className="section-label">Ask about this meeting</p>
      <div className="chat-panel">
        {messages.length === 0 ? (
          <p className="muted chat-empty">
            Ask anything — “what did we decide about pricing?”, “what’s Priya’s action item?”, “summarize the first
            ten minutes”.
          </p>
        ) : (
          <div className="chat-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {sending && <div className="chat-bubble assistant chat-thinking">Thinking…</div>}
          </div>
        )}

        <div className="chat-input-row">
          <input
            className="chat-input"
            placeholder="Ask a question…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            disabled={sending}
          />
          <button className="chat-send-btn" type="button" onClick={() => void handleSend()} disabled={sending || !draft.trim()}>
            Send
          </button>
        </div>
        {error && <p className="muted chat-error">{error}</p>}
      </div>
    </div>
  )
}
