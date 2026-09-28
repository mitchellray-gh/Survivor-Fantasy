import React, { useState, useMemo } from 'react'
import type { Player, PlayerStatus } from '../data/playerService'
import { playerHotness, type Hotness } from '../data/analytics'
import type { PlayerService } from '../data/playerService'
import PlayerCard from './PlayerCard'

interface CastGridProps {
  service: PlayerService
  players: Player[]
  maxEpisode: number
  onVoteOut: (id: number) => void
  onUnvoteOut: (id: number) => void
}

const STATUS_LABEL: Record<PlayerStatus, string> = {
  active:    '',
  voted_out: 'Out',
  medevac:   'Medevac',
  quit:      'Quit',
  winner:    'Winner',
}
const STATUS_CHIP: Record<PlayerStatus, string> = {
  active:    '',
  voted_out: 'chip chip-danger',
  medevac:   'chip chip-warn',
  quit:      'chip chip-neutral',
  winner:    'chip chip-gold',
}
const HOT_LABEL: Record<NonNullable<Hotness>, string> = {
  hot:  'Hot',
  cold: 'Cold',
  risk: 'Risk',
}

/**
 * Grid of photo tiles with a top-right points badge, top-left status pill,
 * and a "hot/cold/risk" heuristic badge derived from analytics. Tapping a
 * tile opens the detail modal (rendered here) with the full PlayerCard.
 */
const CastGrid: React.FC<CastGridProps> = ({ service, players, maxEpisode, onVoteOut, onUnvoteOut }) => {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.managerName.toLowerCase().includes(q) ||
      p.occupation.toLowerCase().includes(q)
    )
  }, [players, query])

  const openPlayer = openId != null ? players.find(p => p.id === openId) ?? null : null

  return (
    <>
      <div className="cast-toolbar">
        <input
          className="input"
          type="search"
          placeholder="Search castaways, managers, or jobs\u2026"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="cast-count">{filtered.length} / {players.length}</span>
      </div>

      <div className="cast-grid">
        {filtered.map(p => {
          const status: PlayerStatus = p.status ?? (p.votedOut ? 'voted_out' : 'active')
          const hot = playerHotness(service, p, maxEpisode)
          const total = service.getPlayerTotal(p.id)
          const isOut = status !== 'active' && status !== 'winner'
          return (
            <button
              key={p.id}
              type="button"
              className={`cast-tile ${isOut ? 'is-out' : ''}`}
              onClick={() => setOpenId(p.id)}
              aria-label={`${p.name}, ${total} points`}
            >
              {status !== 'active' && (
                <span className={`cast-tile-status ${STATUS_CHIP[status]}`}>{STATUS_LABEL[status]}</span>
              )}
              <span className="cast-tile-pts">{total}</span>
              <img className="cast-tile-photo" src={p.photo} alt="" loading="lazy" />
              {hot && !isOut && (
                <span className={`cast-tile-hot ${hot}`}>{HOT_LABEL[hot]}</span>
              )}
              <div className="cast-tile-overlay">
                <div className="cast-tile-name">{p.name}</div>
                <div className="cast-tile-manager">{p.managerName}</div>
              </div>
            </button>
          )
        })}
      </div>

      {openPlayer && (
        <div className="drawer-backdrop" onClick={() => setOpenId(null)}>
          <div className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 className="drawer-title">{openPlayer.name}</h2>
              <button className="icon-btn" onClick={() => setOpenId(null)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <PlayerCard
                player={openPlayer}
                managerLabel={openPlayer.managerName}
                totalPoints={service.getPlayerTotal(openPlayer.id)}
                onVoteOut={onVoteOut}
                onUnvoteOut={onUnvoteOut}
                showVoteControls
                collapsible={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default CastGrid
