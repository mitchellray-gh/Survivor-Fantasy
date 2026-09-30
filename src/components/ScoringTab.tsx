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
      <p>Tap an event to record it for the selected episode, tap again to clear.
         Points apply automatically from the league scoring table.</p>
      <label className="episode-picker">
        Episode:{' '}
        <input
          type="number"
          min={1}
          value={episode}
          onChange={e => onEpisodeChange(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>

      {players.map(p => {
        let epTotal = 0
        for (const c of scoringCategories) {
          epTotal += service.getEventValue(p.id, episode, c.id) * c.points
        }
        const activeCount = scoringCategories
          .filter(c => service.getEventValue(p.id, episode, c.id) > 0)
          .length
        return (
          <div key={p.id} className={`score-card${p.votedOut ? ' row-voted-out' : ''}`}>
            <div className="score-card-head">
              <img src={p.photo} alt="" />
              <div className="score-card-id">
                <div className="score-card-name">{p.name}</div>
                <div className="score-card-sub">
                  {p.managerName}
                  {activeCount > 0 && <> &middot; {activeCount} event{activeCount > 1 ? 's' : ''}</>}
                </div>
              </div>
              <div className={`score-card-total${epTotal < 0 ? ' neg' : ''}`}>
                {epTotal > 0 ? '+' : ''}{epTotal}
                <span>pts</span>
              </div>
            </div>
            <div className="score-card-events">
              {scoringCategories.map(c => {
                const on = service.getEventValue(p.id, episode, c.id) > 0
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`score-ev${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => onToggleEvent(p.id, c.id)}
                  >
                    <span className="score-ev-label">{c.label}</span>
                    <span className={`score-ev-pts${c.points < 0 ? ' neg' : ''}`}>
                      {c.points >= 0 ? '+' : ''}{c.points}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ScoringTab
