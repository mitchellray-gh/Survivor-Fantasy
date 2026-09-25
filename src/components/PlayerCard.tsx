import React, { useState } from 'react'
import type { Player } from '../data/playerService'
import './PlayerCard.css'

interface PlayerCardProps {
  player: Player
  managerLabel?: string
  totalPoints?: number
  onVoteOut?: (playerId: number) => void
  onUnvoteOut?: (playerId: number) => void
  showVoteControls?: boolean
}

const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  managerLabel,
  totalPoints,
  onVoteOut,
  onUnvoteOut,
  showVoteControls = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className={`player-card ${player.votedOut ? 'voted-out' : ''}`}>
      {player.votedOut && <span className="voted-out-badge">Voted Out</span>}

      <div className="player-photo">
        {imgFailed ? (
          <div className="player-photo-fallback">{player.name}</div>
        ) : (
          <img
            src={player.photo}
            alt={player.name}
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        )}
      </div>

      <div className="player-info">
        <h3>{player.name}</h3>
        {managerLabel && <p className="player-drafted-by">Drafted by <strong>{managerLabel}</strong></p>}
        <p><span className="label">Age:</span> {player.age}</p>
        <p><span className="label">Hometown:</span> {player.hometown}</p>
        <p><span className="label">Residence:</span> {player.residence}</p>
        <p><span className="label">Occupation:</span> {player.occupation}</p>
        {typeof totalPoints === 'number' && (
          <p className="player-points"><span className="label">Fantasy points:</span> {totalPoints}</p>
        )}
        <p className="player-about">{player.aboutMe}</p>
      </div>

      {showVoteControls && (
        <div className="player-actions">
          {!player.votedOut && onVoteOut && (
            <button className="vote-out-button" onClick={() => onVoteOut(player.id)}>
              Mark as Voted Out
            </button>
          )}
          {player.votedOut && onUnvoteOut && (
            <button className="unvote-out-button" onClick={() => onUnvoteOut(player.id)}>
              Restore Player
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default PlayerCard
