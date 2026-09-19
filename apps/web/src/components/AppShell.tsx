import type { ComponentType, ReactNode } from 'react'
import { IconHome, IconNotebookPen, IconUsers, IconSparkle, IconProfile } from './icons'

// 'connect' is a real section but deliberately not a tab: the Figma design
// moves Integrations out of the bottom nav and under Profile, so it's
// reached from there rather than getting one of the five tab slots.
export type Section = 'home' | 'notes' | 'meetings' | 'ai' | 'profile' | 'connect'

interface NavItem {
  section: Section
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { section: 'home', label: 'Home', icon: IconHome },
  { section: 'notes', label: 'Notes', icon: IconNotebookPen },
  { section: 'meetings', label: 'Meetings', icon: IconUsers },
  { section: 'ai', label: 'AI', icon: IconSparkle },
  { section: 'profile', label: 'Profile', icon: IconProfile },
]

interface AppShellProps {
  active: Section
  onNavigate: (section: Section) => void
  children: ReactNode
}

export default function AppShell({ active, onNavigate, children }: AppShellProps) {
  // Connect has no tab of its own, so it shows Profile as the active tab —
  // that's where it's reached from, and leaving every tab unlit reads as a bug.
  const activeTab: Section = active === 'connect' ? 'profile' : active

  return (
    <div className="m-shell">
      <div className="m-shell-content">{children}</div>

      <nav className="m-tabbar" aria-label="Primary">
        {NAV_ITEMS.map(({ section, label, icon: Icon }) => (
          <button
            key={section}
            type="button"
            className={section === activeTab ? 'm-tab active' : 'm-tab'}
            aria-current={section === activeTab ? 'page' : undefined}
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
