import React from 'react'
import './TabBar.css'

export type TabId = 'dashboard' | 'players' | 'teams' | 'predictions' | 'scoring'

interface TabBarProps {
  active: TabId
  onChange: (t: TabId) => void
  counts?: Partial<Record<TabId, number>>
}

interface TabDef {
  id: TabId
  label: string
  icon: React.ReactNode
}

const IC = {
  trophy: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M17 4h3v3a5 5 0 0 1-5 5M7 4H4v3a5 5 0 0 0 5 5M17 4H7v6a5 5 0 0 0 10 0V4z" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="4" />
      <path d="M17 11a3 3 0 1 0 0-6M3 21v-1a6 6 0 0 1 6-6h0a6 6 0 0 1 6 6v1M17 14a5 5 0 0 1 4 5v1" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
}

const TABS: TabDef[] = [
  { id: 'dashboard',   label: 'Home',    icon: IC.trophy },
  { id: 'players',     label: 'Cast',    icon: IC.users },
  { id: 'teams',       label: 'Teams',   icon: IC.shield },
  { id: 'predictions', label: 'Predict', icon: IC.eye },
  { id: 'scoring',     label: 'Score',   icon: IC.check },
]

const TabBar: React.FC<TabBarProps> = ({ active, onChange, counts }) => (
  <nav className="tabbar" aria-label="Primary">
    {TABS.map(t => {
      const isActive = active === t.id
      const count = counts?.[t.id]
      return (
        <button
          key={t.id}
          type="button"
          className={`tabbar-item ${isActive ? 'is-active' : ''}`}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <span className="tabbar-icon" aria-hidden="true">{t.icon}</span>
          <span className="tabbar-label">
            {t.label}
            {typeof count === 'number' && <span className="tabbar-count"> {count}</span>}
          </span>
        </button>
      )
    })}
  </nav>
)

export default TabBar
