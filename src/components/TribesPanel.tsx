import React from 'react'
import type { PlayerService } from '../data/playerService'

interface TribesPanelProps {
  service: PlayerService
  onVoteOut?: (id: number) => void
  onUnvoteOut?: (id: number) => void
}

const STATUS_BADGE: Record<string, string> = {
  active:    '',
  voted_out: 'Voted out',
  medevac:   'Medevac',
  quit:      'Quit',
  winner:    'Sole Survivor',
}

/**
 * The tribe board. Survivor is organised around tribes, and tribal loyalty is
 * the strategic core of the format, so this groups the whole cast by tribe
 * rather than leaving the split implied by manager rosters.
 */
const TribesPanel: React.FC<TribesPanelProps> = ({ service, onVoteOut, onUnvoteOut }) => {
  const groups = service.getPlayersByTribe()

  return (
    <div className="tribes">
      {groups.map(({ tribe, players }) => {
        const alive = players.filter(p => !p.votedOut).length
        return (
          <section
            key={tribe.id}
            className="tribe"
            style={{ '--tribe-color': tribe.color } as React.CSSProperties}
          >
            <header className="tribe-head">
              <div className="tribe-name">
                {tribe.name}
                <span className="tribe-color-name">({tribe.colorName})</span>
              </div>
              <div className="tribe-count">
                <strong>{alive}</strong>/{players.length} in
              </div>
            </header>

            <div className="tribe-players">
              {players.map(p => {
                const status = p.status ?? 'active'
                const badge = STATUS_BADGE[status] ?? ''
                return (
                  <div key={p.id} className={`tribe-player${p.votedOut ? ' is-out' : ''}`}>
                    <img src={p.photo} alt="" />
                    <div className="tribe-player-id">
                      <div className="tribe-player-name">{p.name}</div>
                      <div className="tribe-player-manager">{p.managerName}</div>
                    </div>
                    {badge && (
                      <span className={`tribe-badge${status === 'winner' ? ' is-winner' : ''}`}>
                        {badge}
                      </span>
                    )}
                    {onVoteOut && onUnvoteOut && !badge && (
                      <button
                        type="button"
                        className="tribe-out-btn"
                        onClick={() => onVoteOut(p.id)}
                        title="Mark as voted out"
                      >
                        Vote out
                      </button>
                    )}
                    {onVoteOut && onUnvoteOut && badge === 'Voted out' && (
                      <button
                        type="button"
                        className="tribe-out-btn is-revive"
                        onClick={() => onUnvoteOut(p.id)}
                        title="Undo vote out"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default TribesPanel