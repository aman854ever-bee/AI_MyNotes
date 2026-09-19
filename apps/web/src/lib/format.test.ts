// Unit tests for the pure helpers in format.ts.
//
// There's no test framework wired into this repo yet (no Vitest/Jest —
// see docs/testing.md for why and what it would take to add one; the
// short version is that `npm install` isn't reachable from the sandbox
// this suite was first written in). These run on Node's own built-in
// test runner instead, which needs nothing installed:
//
//   node --experimental-strip-types --test src/lib/format.test.ts
//
// or, once Node 24+ is on PATH (type-stripping is stable there),
// just `node --test src/lib/format.test.ts`. `npm run test` wires this
// up (see package.json).
//
// Scope: this covers the pure, dependency-free logic that lives in
// format.ts — date/time formatting, phone normalization, and calendar
// agenda-grouping. It does NOT cover anything that touches Supabase,
// Dexie, the DOM, or React component behavior (OTP input focus
// handling, save-state transitions, etc.) — that needs Vitest +
// Testing Library / Playwright, which needs npm. Don't read "tests
// pass" here as "the app is tested."

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  relativeDate,
  formatDuration,
  dayLabel,
  normalizePhone,
  formatCooldown,
  startOfDay,
  sameDay,
  formatTimeRange,
  groupByDay,
} from './format.ts'
import type { CalendarEvent } from './calendar.ts'

// ---------------------------------------------------------------------
// relativeDate
// ---------------------------------------------------------------------

test('relativeDate: just now for < 1 minute', () => {
  const now = new Date().toISOString()
  assert.equal(relativeDate(now), 'just now')
})

test('relativeDate: minutes ago', () => {
  const iso = new Date(Date.now() - 5 * 60_000).toISOString()
  assert.equal(relativeDate(iso), '5m ago')
})

test('relativeDate: hours ago', () => {
  const iso = new Date(Date.now() - 3 * 3_600_000).toISOString()
  assert.equal(relativeDate(iso), '3h ago')
})

test('relativeDate: exactly one day is "Yesterday"', () => {
  const iso = new Date(Date.now() - 24 * 3_600_000).toISOString()
  assert.equal(relativeDate(iso), 'Yesterday')
})

test('relativeDate: several days ago', () => {
  const iso = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString()
  assert.equal(relativeDate(iso), '3 days ago')
})

test('relativeDate: falls back to a date beyond a week', () => {
  const iso = new Date(Date.now() - 10 * 24 * 3_600_000).toISOString()
  const result = relativeDate(iso)
  assert.ok(!/ago$/.test(result), `expected a formatted date, got "${result}"`)
})

// ---------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------

test('formatDuration: zero seconds', () => {
  assert.equal(formatDuration(0), '0:00')
})

test('formatDuration: pads seconds under 10', () => {
  assert.equal(formatDuration(65), '1:05')
})

test('formatDuration: rounds fractional seconds', () => {
  assert.equal(formatDuration(59.6), '1:00')
})

test('formatDuration: clamps negative input to zero', () => {
  assert.equal(formatDuration(-5), '0:00')
})

test('formatDuration: long meetings roll minutes past 59', () => {
  assert.equal(formatDuration(3725), '62:05')
})

// ---------------------------------------------------------------------
// dayLabel
// ---------------------------------------------------------------------

test('dayLabel: today', () => {
  assert.equal(dayLabel(new Date().toISOString()), 'Today')
})

test('dayLabel: tomorrow', () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  assert.equal(dayLabel(d.toISOString()), 'Tomorrow')
})

test('dayLabel: yesterday', () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  assert.equal(dayLabel(d.toISOString()), 'Yesterday')
})

test('dayLabel: near-midnight event stays on its own calendar day', () => {
  // A 12:30am event "today" should not be pulled into "Yesterday" just
  // because it's close to the day boundary — the whole reason this
  // helper compares calendar days instead of a rolling 24h window.
  const d = new Date()
  d.setHours(0, 30, 0, 0)
  assert.equal(dayLabel(d.toISOString()), 'Today')
})

// ---------------------------------------------------------------------
// normalizePhone
// ---------------------------------------------------------------------

test('normalizePhone: accepts a valid E.164 number', () => {
  assert.equal(normalizePhone('+919876543210'), '+919876543210')
})

test('normalizePhone: strips spaces and dashes before validating', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '+919876543210')
})

test('normalizePhone: rejects a number with no leading +', () => {
  assert.equal(normalizePhone('919876543210'), null)
})

test('normalizePhone: rejects a leading zero after the country code', () => {
  assert.equal(normalizePhone('+0123456789'), null)
})

test('normalizePhone: rejects too few digits', () => {
  assert.equal(normalizePhone('+1234567'), null)
})

test('normalizePhone: rejects too many digits', () => {
  assert.equal(normalizePhone('+1234567890123456'), null)
})

test('normalizePhone: rejects non-digit characters', () => {
  assert.equal(normalizePhone('+91 98765 abcde'), null)
})

// ---------------------------------------------------------------------
// formatCooldown
// ---------------------------------------------------------------------

test('formatCooldown: formats seconds under a minute', () => {
  assert.equal(formatCooldown(5), '00:05')
})

test('formatCooldown: formats a full 30s resend window', () => {
  assert.equal(formatCooldown(30), '00:30')
})

test('formatCooldown: formats minutes and seconds', () => {
  assert.equal(formatCooldown(125), '02:05')
})

// ---------------------------------------------------------------------
// startOfDay / sameDay
// ---------------------------------------------------------------------

test('startOfDay: zeroes the time but keeps the calendar day', () => {
  const d = new Date(2026, 2, 15, 23, 45, 30)
  const start = startOfDay(d)
  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 2)
  assert.equal(start.getDate(), 15)
  assert.equal(start.getHours(), 0)
  assert.equal(start.getMinutes(), 0)
  assert.equal(start.getSeconds(), 0)
})

test('startOfDay: does not mutate the input date', () => {
  const d = new Date(2026, 2, 15, 23, 45, 30)
  startOfDay(d)
  assert.equal(d.getHours(), 23, 'original Date object must be left untouched')
})

test('sameDay: matches an ISO string against a Date on the same calendar day', () => {
  const iso = new Date(2026, 5, 10, 8, 0, 0).toISOString()
  const target = new Date(2026, 5, 10, 20, 0, 0)
  assert.equal(sameDay(iso, target), true)
})

test('sameDay: false across a day boundary', () => {
  const iso = new Date(2026, 5, 10, 23, 59, 0).toISOString()
  const target = new Date(2026, 5, 11, 0, 1, 0)
  assert.equal(sameDay(iso, target), false)
})

// ---------------------------------------------------------------------
// formatTimeRange
// ---------------------------------------------------------------------

test('formatTimeRange: start only, no end time', () => {
  const start = new Date(2026, 5, 10, 14, 30, 0).toISOString()
  const result = formatTimeRange(start, null)
  assert.ok(result.length > 0 && !result.includes('–'), `expected a single time, got "${result}"`)
})

test('formatTimeRange: includes both start and end', () => {
  const start = new Date(2026, 5, 10, 14, 30, 0).toISOString()
  const end = new Date(2026, 5, 10, 15, 30, 0).toISOString()
  const result = formatTimeRange(start, end)
  assert.ok(result.includes('–'), `expected a range, got "${result}"`)
})

// ---------------------------------------------------------------------
// groupByDay
// ---------------------------------------------------------------------

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'evt-' + Math.random().toString(36).slice(2),
    title: 'Test event',
    start_at: new Date().toISOString(),
    end_at: null,
    location: null,
    organizer_name: null,
    join_url: null,
    is_cancelled: false,
    ...overrides,
  } as CalendarEvent
}

test('groupByDay: empty input produces no groups', () => {
  assert.deepEqual(groupByDay([]), [])
})

test('groupByDay: consecutive same-day events land in one group', () => {
  const today = new Date()
  const e1 = makeEvent({ start_at: new Date(today.setHours(9)).toISOString() })
  const e2 = makeEvent({ start_at: new Date(today.setHours(11)).toISOString() })
  const groups = groupByDay([e1, e2])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].events.length, 2)
})

test('groupByDay: events on different days get separate groups in order', () => {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const e1 = makeEvent({ start_at: today.toISOString() })
  const e2 = makeEvent({ start_at: tomorrow.toISOString() })
  const groups = groupByDay([e1, e2])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].label, 'Today')
  assert.equal(groups[1].label, 'Tomorrow')
})

test('groupByDay: does not merge non-adjacent events sharing a label', () => {
  // If the caller ever passes events out of chronological order, two
  // "Today" clusters separated by a "Tomorrow" one should stay as two
  // separate groups, not silently merge — groupByDay only coalesces
  // *adjacent* same-label events, by design (it trusts its caller to
  // pass events already sorted by start time).
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const e1 = makeEvent({ start_at: today.toISOString() })
  const e2 = makeEvent({ start_at: tomorrow.toISOString() })
  const e3 = makeEvent({ start_at: today.toISOString() })
  const groups = groupByDay([e1, e2, e3])
  assert.equal(groups.length, 3)
})
