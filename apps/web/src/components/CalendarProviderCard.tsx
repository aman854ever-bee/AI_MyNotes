import { useState } from 'react'
import { IconGoogle, IconMicrosoft, IconChevronRight } from './icons'
import { relativeDate } from '../lib/format'
import { canConnect, summarize, type CheckResult, type ProviderRequirements } from '../lib/calendarRequirements'
import type { CalendarAccount } from '../lib/calendar'

interface CalendarProviderCardProps {
  requirements: ProviderRequirements
  account: CalendarAccount | null
  /** null while the first check is still running. */
  checks: CheckResult[] | null
  checking: boolean
  connecting: boolean
  syncing: boolean
  toggling: boolean
  onRecheck: () => void
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
  onToggleSync: () => void
}

function statusClass(status: CheckResult['status']): string {
  if (status === 'pass') return 'setup-check pass'
  if (status === 'fail') return 'setup-check fail'
  if (status === 'warn') return 'setup-check warn'
  return 'setup-check skipped'
}

function statusMark(status: CheckResult['status']): string {
  if (status === 'pass') return '✓'
  if (status === 'fail') return '✗'
  if (status === 'warn') return '!'
  return '–'
}

/**
 * One calendar provider: what it needs, whether that's actually in place,
 * and the controls to use it.
 *
 * The connect button stays disabled until the checks pass, which is the
 * point of the whole card — connecting a provider whose secrets aren't set
 * produces an account that looks connected, never syncs, and gives no clue
 * why. Failing checks name the specific thing to fix rather than saying
 * "not configured".
 */
export default function CalendarProviderCard({
  requirements,
  account,
  checks,
  checking,
  connecting,
  syncing,
  toggling,
  onRecheck,
  onConnect,
  onDisconnect,
  onSync,
  onToggleSync,
}: CalendarProviderCardProps) {
  const [showSteps, setShowSteps] = useState(false)

  const summary = checks ? summarize(checks) : { status: 'skipped' as const, text: 'Checking…' }
  const blocking = checks?.filter((c) => c.status === 'fail') ?? []
  const ready = checks !== null && canConnect(checks)

  return (
    <div className="m-card m-card-lg">
      <div className="m-list-item" style={{ cursor: 'default' }}>
        <span className="m-list-icon">
          {requirements.id === 'google' ? <IconGoogle size={18} /> : <IconMicrosoft size={18} />}
        </span>
        <span className="m-list-copy">
          <span className="m-list-title">{requirements.label}</span>
          <span className="m-list-sub">
            {account
              ? [account.provider_email, account.last_synced_at ? `Synced ${relativeDate(account.last_synced_at)}` : 'Not synced yet']
                  .filter(Boolean)
                  .join(' · ')
              : requirements.purpose}
          </span>
        </span>
        <span
          className={
            !account ? 'm-status-pill' : account.sync_enabled ? 'm-status-pill connected' : 'm-status-pill paused'
          }
        >
          {!account ? 'Off' : account.sync_enabled ? 'On' : 'Paused'}
        </span>
      </div>

      {/* Setup state — shown until it's connected and healthy, since that's
          when it stops being useful and starts being noise. */}
      {(!account || blocking.length > 0) && (
        <>
          <div className="m-divider" />
          <div className="setup-summary">
            <span className={statusClass(summary.status)}>
              <span className="setup-mark" aria-hidden="true">
                {statusMark(summary.status)}
              </span>
              {checking ? 'Checking setup…' : summary.text}
            </span>
            <button type="button" className="m-small-btn ghost" onClick={onRecheck} disabled={checking}>
              {checking ? 'Checking…' : 'Re-check'}
            </button>
          </div>

          {checks && blocking.length > 0 && (
            <ul className="setup-check-list">
              {blocking.map((c) => (
                <li key={c.id} className={statusClass(c.status)}>
                  <span className="setup-mark" aria-hidden="true">
                    {statusMark(c.status)}
                  </span>
                  <span>
                    <strong>{c.label}</strong>
                    {c.detail && <span className="setup-check-detail">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="setup-steps-toggle"
            onClick={() => setShowSteps((v) => !v)}
            aria-expanded={showSteps}
          >
            <span className={showSteps ? 'setup-steps-chevron open' : 'setup-steps-chevron'}>
              <IconChevronRight size={14} />
            </span>
            What this needs ({requirements.steps.length} steps)
          </button>

          {showSteps && (
            <ol className="setup-steps">
              {requirements.steps.map((step) => (
                <li key={step.title}>
                  <span className="setup-step-title">{step.title}</span>
                  <span className="setup-step-where">{step.where}</span>
                  {step.value && <code className="setup-step-value">{step.value}</code>}
                  {step.secret && (
                    <span className="setup-step-note">
                      Enter this yourself — the app never sees or stores it.
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <div className="m-inline-actions">
        {!account ? (
          <button
            type="button"
            className="m-small-btn"
            disabled={!ready || connecting || checking}
            onClick={onConnect}
            title={ready ? undefined : 'Finish the setup steps first'}
          >
            {connecting ? 'Redirecting…' : ready ? 'Connect' : 'Connect (setup incomplete)'}
          </button>
        ) : (
          <>
            <button type="button" className="m-small-btn" disabled={syncing} onClick={onSync}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className="m-small-btn ghost" onClick={onDisconnect}>
              Disconnect
            </button>
          </>
        )}
      </div>

      {account && (
        <>
          <div className="m-divider" />
          <div className="m-list-item" style={{ cursor: 'default' }}>
            <span className="m-list-copy">
              <span className="m-list-title">Sync automatically</span>
              <span className="m-list-sub">
                {account.sync_enabled ? 'Included next time you sync' : 'Paused — skipped until you turn this back on'}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={account.sync_enabled}
              aria-label={`Sync ${requirements.label} automatically`}
              className={account.sync_enabled ? 'm-toggle on' : 'm-toggle'}
              disabled={toggling}
              onClick={onToggleSync}
            />
          </div>
        </>
      )}
    </div>
  )
}
