import React, { useState } from 'react'
import type { Player } from '../data/playerService'
import './PlayerCard.css'

interface PlayerCardProps {
  player: Player
  managerLabel?: string
  totalPoints?: number
  onVoteOut?: (playerId: number) => void
  onUnvoteOut?: (playerId: number) => void
  /** True when this card is the pending vote-out confirmation. */
  confirmingVoteOut?: boolean
  /** Open the shared player detail sheet. */
  onInspect?: (playerId: number) => void
  showVoteControls?: boolean
  /** If true, render the collapsed row and expand on tap. Default: true. */
  collapsible?: boolean
}

/** Small avatar used inline in list rows and in the scoring table. */
export const PlayerAvatar: React.FC<{ player: Player; size?: number }> = ({ player, size = 44 }) => {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size } as React.CSSProperties
  if (failed) {
    return (
      <div className="avatar avatar-fallback" style={style} aria-hidden="true">
        {player.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
      </div>
    )
  }
  return (
    <img
      className="avatar"
      style={style}
      src={player.photo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  managerLabel,
  totalPoints,
  onVoteOut,
  onUnvoteOut,
  confirmingVoteOut,
  onInspect,
  showVoteControls = false,
  collapsible = true,
}) => {
  const [expanded, setExpanded] = useState(!collapsible)
  const toggle = () => { if (collapsible) setExpanded(v => !v) }

  return (
    <article className={`player-row ${player.votedOut ? 'is-voted-out' : ''} ${expanded ? 'is-expanded' : ''}`}>
      <button
        type="button"
        className="player-row-header"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`player-details-${player.id}`}
      >
        <PlayerAvatar player={player} size={48} />
        <div className="player-row-main">
          <div className="player-row-name-line">
            <span className="player-row-name">{player.name}</span>
            {player.votedOut && <span className="chip chip-danger">OUT</span>}
          </div>
          <div className="player-row-meta">
            {managerLabel && <span>{managerLabel}</span>}
            {managerLabel && <span className="dot">&middot;</span>}
            <span>{player.occupation}</span>
          </div>
        </div>
        {collapsible && (
          <span className={`chev ${expanded ? 'chev-up' : ''}`} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>

      {/* Points sit OUTSIDE the toggle button (a nested button is invalid HTML)
          and open the shared player detail sheet. */}
      {typeof totalPoints === 'number' && (
        onInspect ? (
          <button
            type="button"
            className="player-row-points player-row-points-btn"
            onClick={() => onInspect(player.id)}
            aria-label={`See ${player.name}'s points history`}
          >
            <span className="pts-value">{totalPoints}</span>
            <span className="pts-label">pts</span>
          </button>
        ) : (
          <div className="player-row-points">
            <span className="pts-value">{totalPoints}</span>
            <span className="pts-label">pts</span>
          </div>
        )
      )}

      {expanded && (
        <div id={`player-details-${player.id}`} className="player-row-body">
          <dl className="player-row-facts">
            <div><dt>Age</dt><dd>{player.age}</dd></div>
            <div><dt>Hometown</dt><dd>{player.hometown}</dd></div>
            <div><dt>Residence</dt><dd>{player.residence}</dd></div>
            <div><dt>Occupation</dt><dd>{player.occupation}</dd></div>
          </dl>
          <p className="player-row-bio">{player.aboutMe}</p>
          {showVoteControls && (
            <div className="player-row-actions">
              {!player.votedOut && onVoteOut && (
                <button
                  className={confirmingVoteOut ? 'btn btn-danger' : 'btn btn-neutral'}
                  onClick={() => onVoteOut(player.id)}
                >
                  {confirmingVoteOut ? 'Tap again to confirm' : 'Mark as voted out'}
                </button>
              )}
              {player.votedOut && onUnvoteOut && (
                <button className="btn btn-neutral" onClick={() => onUnvoteOut(player.id)}>
                  Restore
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export default PlayerCard
