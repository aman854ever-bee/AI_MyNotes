import type { CalendarEvent } from './calendar'

export function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.round((now - then) / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const diffDay = Math.round(diffHr / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay} days ago`

  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

/**
 * Groups a day into "Today" / "Tomorrow" / weekday+date, for the Calendar
 * page's agenda list. Compares by calendar day, not a 24h window, so an
 * event at 12:30am still lands under the right heading.
 */
export function dayLabel(iso: string): string {
  const date = new Date(iso)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((day.getTime() - todayStart.getTime()) / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'

  const sameYear = date.getFullYear() === today.getFullYear()
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

// Moved here (from Login.tsx) so it's testable in isolation from React/JSX —
// pure, no side effects. E.164: a leading + followed by 8-15 digits, no
// spaces/dashes.
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null
}

// Moved here (from Login.tsx) for the same reason — formats a countdown of
// seconds as mm:ss for the OTP resend cooldown.
export function formatCooldown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Moved here (from Calendar.tsx) for the same reason — the Calendar page's
// date-strip and agenda-grouping helpers.
export function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function sameDay(a: string, b: Date): boolean {
  const d = new Date(a)
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
}

export function formatTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (!endIso) return start
  const end = new Date(endIso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${start} – ${end}`
}

export function groupByDay(events: CalendarEvent[]): { label: string; events: CalendarEvent[] }[] {
  const groups: { label: string; events: CalendarEvent[] }[] = []
  for (const event of events) {
    const label = dayLabel(event.start_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.events.push(event)
    else groups.push({ label, events: [event] })
  }
  return groups
}
