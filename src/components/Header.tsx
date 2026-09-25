import React from 'react'
import './Header.css'

interface HeaderProps {
  title: string
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="title">{title}</h1>
      </div>
    </header>
  )
}

export default Header