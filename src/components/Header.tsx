import React from 'react'
import './Header.css'

interface HeaderProps {
  title: string
  subtitle?: string
  right?: React.ReactNode
  /** When provided, renders a gear icon on the far right that opens admin. */
  onOpenAdmin?: () => void
}

const GearIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const Header: React.FC<HeaderProps> = ({ title, subtitle, right, onOpenAdmin }) => (
  <header className="app-topbar">
    <div className="app-topbar-inner">
      <div className="app-topbar-titles">
        <h1 className="app-topbar-title">{title}</h1>
        {subtitle && <span className="app-topbar-subtitle">{subtitle}</span>}
      </div>
      <div className="app-topbar-right">
        {right}
        {onOpenAdmin && (
          <button type="button" className="icon-btn" onClick={onOpenAdmin} aria-label="Open admin">
            <GearIcon />
          </button>
        )}
      </div>
    </div>
  </header>
)

export default Header
