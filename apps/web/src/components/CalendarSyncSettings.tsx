import { useState } from 'react'
import {
  MAX_SYNC_INTERVAL_MINUTES,
  MAX_SYNC_WINDOW_DAYS,
  MIN_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_WINDOW_DAYS,
  type SyncPreferences,
} from '../lib/syncSchedule'

interface CalendarSyncSettingsProps {
  prefs: SyncPreferences
  /** Null when nothing is connected — the controls are still shown, but
   *  explained as having nothing to act on yet. */
  hasAccount: boolean
  lastSyncedAt: number | null
  idleReason: string | null
  saving: boolean
  onSave: (next: SyncPreferences) => void
}

const INTERVAL_CHOICES = [15, 30, 60, 180, 720] as const
const WINDOW_CHOICES = [7, 14, 30, 60] as const

function intervalLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return hours === 1 ? 'Every hour' : `${hours} hours`
}

/**
 * Controls for how calendar sync behaves.
 *
 * These exist because all of it used to be hardcoded — a 14-day window, no
 * automatic sync at all. The interval and window are offered as fixed
 * choices rather than free number inputs: both have real bounds (an
 * interval under a few minutes just burns API quota; a window past ~60
 * days silently truncates, because neither provider fetch follows
 * pagination yet), and a select can't express a value that gets clamped
 * away behind the user's back.
 */
export default function CalendarSyncSettings({
  prefs,
  hasAccount,
  lastSyncedAt,
  idleReason,
  saving,
  onSave,
}: CalendarSyncSettingsProps) {
  const [open, setOpen] = useState(false)

  function update(patch: Partial<SyncPreferences>) {
    onSave({ ...prefs, ...patch })
  }

  return (
    <div className="m-card m-card-lg">
      <div className="m-list-item" style={{ cursor: 'default' }}>
        <span className="m-list-copy">
          <span className="m-list-title">Keep my calendar up to date</span>
          <span className="m-list-sub">
            {!hasAccount
              ? 'Connect a calendar above to switch this on'
              : prefs.autoSync
                ? `Checking every ${intervalLabel(prefs.syncIntervalMinutes).toLowerCase()} while the app is open`
                : 'Off — events only update when you tap Sync now'}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.autoSync}
          aria-label="Sync calendar automatically"
          className={prefs.autoSync ? 'm-toggle on' : 'm-toggle'}
          disabled={saving}
          onClick={() => update({ autoSync: !prefs.autoSync })}
        />
      </div>

      {(lastSyncedAt || idleReason) && (
        <p className="sync-status">
          {lastSyncedAt && <>Last synced {new Date(lastSyncedAt).toLocaleTimeString()}. </>}
          {idleReason}
        </p>
      )}

      <button
        type="button"
        className="setup-steps-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={open ? 'setup-steps-chevron open' : 'setup-steps-chevron'}>▸</span>
        Sync options
      </button>

      {open && (
        <div className="sync-options">
          <label className="sync-option">
            <span className="sync-option-label">How often to check</span>
            <select
              value={prefs.syncIntervalMinutes}
              disabled={saving || !prefs.autoSync}
              onChange={(e) => update({ syncIntervalMinutes: Number(e.target.value) })}
            >
              {INTERVAL_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {intervalLabel(m)}
                </option>
              ))}
              {/* Keeps a stored value visible even if it isn't one of the
                  presets — otherwise the select would silently show the
                  wrong thing. */}
              {!INTERVAL_CHOICES.includes(prefs.syncIntervalMinutes as (typeof INTERVAL_CHOICES)[number]) && (
                <option value={prefs.syncIntervalMinutes}>{intervalLabel(prefs.syncIntervalMinutes)}</option>
              )}
            </select>
            <span className="sync-option-hint">
              Between {MIN_SYNC_INTERVAL_MINUTES} minutes and {MAX_SYNC_INTERVAL_MINUTES / 60} hours.
            </span>
          </label>

          <label className="sync-option">
            <span className="sync-option-label">How far ahead to pull</span>
            <select
              value={prefs.syncWindowDays}
              disabled={saving}
              onChange={(e) => update({ syncWindowDays: Number(e.target.value) })}
            >
              {WINDOW_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
              {!WINDOW_CHOICES.includes(prefs.syncWindowDays as (typeof WINDOW_CHOICES)[number]) && (
                <option value={prefs.syncWindowDays}>{prefs.syncWindowDays} days</option>
              )}
            </select>
            <span className="sync-option-hint">
              {MIN_SYNC_WINDOW_DAYS}–{MAX_SYNC_WINDOW_DAYS} days. Only the first 50 events are fetched.
            </span>
          </label>

          <p className="sync-option-note">
            Syncing happens while the app is open. Nothing runs in the background when it&apos;s closed.
          </p>
        </div>
      )}
    </div>
  )
}
