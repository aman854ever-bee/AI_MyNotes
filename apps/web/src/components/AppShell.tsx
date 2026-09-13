import type { ComponentType, ReactNode } from 'react'
import { IconCalendar, IconConnect, IconDashboard, IconDoc, IconProfile } from './icons'

export type Section = 'dashboard' | 'notes' | 'calendar' | 'connect' | 'profile'

interface NavItem {
  section: Section
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { section: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { section: 'notes', label: 'Notes', icon: IconDoc },
  { section: 'calendar', label: 'Calendar', icon: IconCalendar },
  { section: 'connect', label: 'Connect', icon: IconConnect },
  { section: 'profile', label: 'Profile', icon: IconProfile },
]

interface AppShellProps {
  active: Section
  onNavigate: (section: Section) => void
  children: ReactNode
}

export default function AppShell({ active, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <nav className="app-rail" aria-label="Primary">
        {NAV_ITEMS.map(({ section, label, icon: Icon }) => (
          <button
            key={section}
            type="button"
            className={section === active ? 'rail-item active' : 'rail-item'}
            aria-current={section === active ? 'page' : undefined}
            onClick={() => onNavigate(section)}
          >
            <Icon size={20} />
            <span className="l">{label}</span>
          </button>
        ))}
      </nav>

      <div className="app-shell-content">{children}</div>

      <nav className="tabbar" aria-label="Primary">
        {NAV_ITEMS.map(({ section, label, icon: Icon }) => (
          <button
            key={section}
            type="button"
            className={section === active ? 'tab active' : 'tab'}
            aria-current={section === active ? 'page' : undefined}
            onClick={() => onNavigate(section)}
          >
            <Icon size={20} />
            <span className="l">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
