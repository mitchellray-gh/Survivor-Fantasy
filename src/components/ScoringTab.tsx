import React from 'react'
import { getAdminKey } from '../data/storage'
import type { PlayerService, Player, ScoringCategory, ScoringCategoryId } from '../data/playerService'

interface ScoringTabProps {
  service: PlayerService
  players: Player[]
  scoringCategories: ScoringCategory[]
  episode: number
  onEpisodeChange: (n: number) => void
  onToggleEvent: (playerId: number, catId: ScoringCategoryId) => void
  /** Set when the backend is remote, so the grid must be admin-key gated. */
  needsAdminKey: boolean
  onOpenAdmin: () => void
}

const ScoringTab: React.FC<ScoringTabProps> = ({
  service, players, scoringCategories, episode, onEpisodeChange, onToggleEvent,
  needsAdminKey, onOpenAdmin,
}) => {
  // Remote backends reject writes without the key, so hide the buttons rather
  // than let the user tap into a 401. Local storage needs no key at all.
  const locked = needsAdminKey && getAdminKey().length === 0

  if (locked) {
    return (
      <div className="scoring-content">
        <h2>Score an Episode</h2>
        <p>Scoring writes go straight to the shared league database, so the
           commissioner key is required before you can change any scores.</p>
        <button type="button" className="btn btn-primary" onClick={onOpenAdmin}>
          Enter admin key
        </button>
        <p className="drawer-help" style={{ marginTop: 12 }}>
          Once the key is saved, this grid becomes editable. Tapping a category
          button adds that event for the selected episode; tapping it again
          removes it.
        </p>
      </div>
    )
  }

  return (
  <div className="scoring-content">
    <h2>Score an Episode</h2>
    <p>Toggle the events that happened to each castaway in the selected episode. Points update automatically and persist in this browser.</p>
    <label className="episode-picker">
      Episode:{' '}
      <input
        type="number"
        min={1}
        value={episode}
        onChange={e => onEpisodeChange(Math.max(1, Number(e.target.value) || 1))}
      />
    </label>
    <div className="scoring-table-wrapper">
      <table className="scoring-table">
        <thead>
          <tr>
            <th className="sticky-col">Player</th>
            {scoringCategories.map(c => (
              <th key={c.id} title={c.label}>
                <div className="cat-label">{c.label}</div>
                <div className={`cat-pts ${c.points >= 0 ? 'pos' : 'neg'}`}>
                  {c.points >= 0 ? '+' : ''}{c.points}
                </div>
              </th>
            ))}
            <th>Ep. total</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => {
            let epTotal = 0
            for (const c of scoringCategories) {
              epTotal += service.getEventValue(p.id, episode, c.id) * c.points
            }
            return (
              <tr key={p.id} className={p.votedOut ? 'row-voted-out' : ''}>
                <td className="sticky-col">
                  <div className="scoring-player-cell">
                    <img src={p.photo} alt="" />
                    <div>
                      <div>{p.name}</div>
                      <small>{p.managerName}</small>
                    </div>
                  </div>
                </td>
                {scoringCategories.map(c => (
                  <td key={c.id}>
                    <button
                      type="button"
                      className={`score-btn${service.getEventValue(p.id, episode, c.id) > 0 ? ' is-on' : ''}`}
                      aria-pressed={service.getEventValue(p.id, episode, c.id) > 0}
                      aria-label={`${c.label} for ${p.name}`}
                      title={c.label}
                      onClick={() => onToggleEvent(p.id, c.id)}
                    >
                      {c.points >= 0 ? '+' : ''}{c.points}
                    </button>
                  </td>
                ))}
                <td className={`pts ${epTotal < 0 ? 'neg' : ''}`}>{epTotal}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </div>
  )
}

export default ScoringTab
