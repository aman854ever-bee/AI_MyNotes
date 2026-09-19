import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { listCalendarAccounts, type CalendarAccount } from '../lib/calendar'
import { IconLink, IconDatabase, IconChevronRight } from '../components/icons'

const APP_VERSION = '0.1.0'

interface ProfileProps {
  session: Session | null
  onOpenConnect: () => void
}

function initialsFor(name: string, identifier: string): string {
  const source = name || identifier
  const parts = source.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export default function Profile({ session, onOpenConnect }: ProfileProps) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([])
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    listCalendarAccounts()
      .then((a) => {
        if (!cancelled) setAccounts(a)
      })
      .catch(() => {})
    // Real on-device usage, not a made-up figure — supported in every
    // browser this PWA targets, and simply omitted where it isn't.
    navigator.storage
      ?.estimate?.()
      .then((estimate) => {
        if (cancelled) return
        if (typeof estimate.usage === 'number' && typeof estimate.quota === 'number') {
          setStorage({ usage: estimate.usage, quota: estimate.quota })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const meta = session?.user?.user_metadata as { full_name?: string; name?: string } | undefined
  const displayName = meta?.full_name ?? meta?.name ?? ''
  const identifier = session?.user.email ?? session?.user.phone ?? ''

  const connected = accounts.filter((a) => a.sync_enabled)
  const integrationsSummary =
    accounts.length === 0
      ? 'No calendar connected'
      : connected.length === accounts.length
        ? `${accounts.map((a) => (a.provider === 'google' ? 'Google Calendar' : 'Microsoft')).join(', ')} connected`
        : `${connected.length} of ${accounts.length} connected`

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <div className="m-screen">
      <div className="m-header">
        <div className="m-heading">
          <h1>Profile &amp; settings</h1>
        </div>
      </div>

      <div className="m-card m-card-lg">
        <div className="m-list-item" style={{ cursor: 'default' }}>
          <span className="m-avatar">{initialsFor(displayName, identifier)}</span>
          <span className="m-list-copy">
            <span className="m-identity-name">{displayName || identifier || 'Your account'}</span>
            {displayName && identifier && <span className="m-list-sub">{identifier}</span>}
          </span>
        </div>
      </div>

      {/* The design's "Preferences" card (notifications, default reminder, AI
          tone) is deliberately not built yet: nothing in the app stores or
          reads those settings, and a row that silently does nothing is worse
          than one that isn't there. It slots in here once those backends
          exist. */}

      <div className="m-section-heading">
        <h2>Account</h2>
      </div>

      <div className="m-card m-card-lg">
        <button type="button" className="m-list-item" onClick={onOpenConnect}>
          <span className="m-list-icon">
            <IconLink size={18} />
          </span>
          <span className="m-list-copy">
            <span className="m-list-title">Integrations</span>
            <span className="m-list-sub">{integrationsSummary}</span>
          </span>
          <span className="m-list-chevron">
            <IconChevronRight size={16} />
          </span>
        </button>

        {storage && (
          <>
            <div className="m-divider" />
            <div className="m-list-item" style={{ cursor: 'default' }}>
              <span className="m-list-icon">
                <IconDatabase size={18} />
              </span>
              <span className="m-list-copy">
                <span className="m-list-title">Storage</span>
                <span className="m-list-sub">
                  {formatBytes(storage.usage)} of {formatBytes(storage.quota)} used on this device
                </span>
              </span>
            </div>
          </>
        )}
      </div>

      {supabase && (
        <button type="button" className="m-secondary-btn" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      )}

      <p className="m-version-footer">MyNotes {APP_VERSION}</p>
    </div>
  )
}
