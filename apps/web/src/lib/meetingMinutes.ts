// Builds a single "Meeting Minutes" document out of data that already
// exists once a meeting has been analyzed and its suggestions approved
// (Phase 4) — this module adds no new facts, it just composes the title,
// date, participants, agenda, summary, decisions and action items into one
// readable/shareable document (Markdown, for copy/download; plain text for
// a quick clipboard-friendly variant).

import type { LocalActionItem, LocalDecision, LocalMeeting } from './db'

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function actionStatusLabel(status: LocalActionItem['status']): string {
  switch (status) {
    case 'completed':
      return 'Done'
    case 'in_progress':
      return 'In progress'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Open'
  }
}

export interface MeetingMinutesData {
  meeting: LocalMeeting
  decisions: LocalDecision[]
  actionItems: LocalActionItem[]
}

/** Whether there's anything worth showing a "Meeting minutes" document for. */
export function hasMeetingMinutesContent({ meeting, decisions, actionItems }: MeetingMinutesData): boolean {
  return Boolean(meeting.summary) || decisions.length > 0 || actionItems.length > 0
}

export function buildMeetingMinutesMarkdown({ meeting, decisions, actionItems }: MeetingMinutesData): string {
  const lines: string[] = []
  const title = meeting.title.trim() || 'Untitled meeting'

  lines.push(`# ${title}`, '')

  const metaBits = [formatDateTime(meeting.startedAt ?? meeting.createdAt)].filter(Boolean)
  if (metaBits.length) lines.push(`_${metaBits.join(' · ')}_`, '')

  if (meeting.participantNames.length) {
    lines.push(`**Attendees:** ${meeting.participantNames.join(', ')}`, '')
  }

  if (meeting.agenda) {
    lines.push('## Agenda', '', meeting.agenda.trim(), '')
  }

  lines.push('## Summary', '')
  lines.push(meeting.summary ? meeting.summary.trim() : '_No summary yet — analyze this meeting to generate one._', '')

  lines.push('## Decisions', '')
  if (decisions.length) {
    for (const d of decisions) {
      lines.push(`- ${d.text}${d.context ? ` _(${d.context})_` : ''}`)
    }
  } else {
    lines.push('_No decisions recorded._')
  }
  lines.push('')

  lines.push('## Action items', '')
  if (actionItems.length) {
    for (const a of actionItems) {
      const bits = [a.owner ? `Owner: ${a.owner}` : null, a.dueDate ? `Due: ${a.dueDate}` : null, actionStatusLabel(a.status)]
        .filter(Boolean)
        .join(' · ')
      lines.push(`- [${a.status === 'completed' ? 'x' : ' '}] ${a.title}${bits ? ` — ${bits}` : ''}`)
    }
  } else {
    lines.push('_No action items recorded._')
  }
  lines.push('')

  return lines.join('\n').trim() + '\n'
}

export function meetingMinutesFilename(meeting: LocalMeeting): string {
  const base = (meeting.title.trim() || 'meeting-minutes')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const date = (meeting.startedAt ?? meeting.createdAt).slice(0, 10)
  return `${date}-${base || 'meeting-minutes'}.md`
}
