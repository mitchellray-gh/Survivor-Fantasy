import React from 'react'
import type { PlayerService, Player, ScoringCategory } from '../data/playerService'

interface PredictionsTabProps {
  service: PlayerService
  players: Player[]
  scoringCategories: ScoringCategory[]
  /** Which manager the current viewer is picking on behalf of. */
  currentManager: string | null
  managers: string[]
  onChangeManager: (name: string) => void
  episode: number
  onEpisodeChange: (n: number) => void
  onSetPrediction: (categoryId: string, targetPlayerId: number | null) => void
}

// Which scoring categories are worth predicting each episode. We keep this
// short: high-signal boolean events that make sense as "who will do X?"
// picks. Category ids come straight from scoringRules.ts.
const PREDICTION_CATEGORIES: string[] = [
  'individual_immunity',
  'found_idol_or_advantage',
  'first_to_cry',
  'played_idol_successfully',
  'individual_reward',
]

const CATEGORY_QUESTION: Record<string, string> = {
  individual_immunity:      'Who wins Individual Immunity?',
  found_idol_or_advantage:  'Who finds an Idol or Advantage?',
  first_to_cry:             'Who cries first?',
  played_idol_successfully: 'Who successfully plays an Idol?',
  individual_reward:        'Who wins Individual Reward?',
}

/**
 * Weekly prediction UI. Each manager picks one castaway per prediction
 * category; correct picks award bonus points (applied by the commissioner
 * via the Admin drawer's override tool once results are in - keeps the
 * scoring auditable).
 */
const PredictionsTab: React.FC<PredictionsTabProps> = ({
  service, players, scoringCategories, currentManager, managers,
  onChangeManager, episode, onEpisodeChange, onSetPrediction,
}) => {
  const alive = players.filter(p => !p.votedOut)
  const cats = scoringCategories.filter(c => PREDICTION_CATEGORIES.includes(c.id))
  const locked = service.getMeta('predictions_locked') === 'true'

  return (
    <div className="tab-panel">
      <div className="predictions-intro">
        Pick <strong>who</strong> you think will do each thing this episode.
        Correct picks earn your team a <span className="highlight">bonus</span>
        {' '}the commissioner will apply after the episode airs.
        {locked && <> <strong className="highlight">Predictions are locked.</strong></>}
      </div>

      <div className="card">
        <div className="card-title-row">
          <span className="card-title">Your picks</span>
          <span className="card-title-sub">Episode {episode}</span>
        </div>
        <div className="drawer-section-body">
          <div className="drawer-row">
            <label>Manager</label>
            <select
              className="select"
              value={currentManager ?? ''}
              onChange={e => onChangeManager(e.target.value)}
            >
              <option value="" disabled>Choose your manager\u2026</option>
              {managers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="drawer-row">
            <label>Episode</label>
            <input
              className="input"
              type="number"
              min={1}
              value={episode}
              onChange={e => onEpisodeChange(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>
      </div>

      {!currentManager && (
        <div className="pred-empty">
          Pick your manager above to start making predictions.
        </div>
      )}

      {currentManager && (
        <div className="list-card">
          {cats.length === 0 && (
            <div className="pred-empty">No prediction categories configured.</div>
          )}
          {cats.map(cat => {
            const current = service.getPrediction(currentManager, episode, cat.id)
            return (
              <div key={cat.id} className="pred-picker-row">
                <div className="pred-picker-label">
                  <div className="pred-picker-label-main">
                    {CATEGORY_QUESTION[cat.id] ?? cat.label}
                  </div>
                  <div className="pred-picker-label-sub">
                    Correct = +{Math.abs(cat.points)} bonus
                  </div>
                </div>
                <select
                  className="select pred-picker-select"
                  disabled={locked}
                  value={current == null ? '' : String(current)}
                  onChange={e => {
                    const raw = e.target.value
                    onSetPrediction(cat.id, raw === '' ? null : Number(raw))
                  }}
                >
                  <option value="">Skip</option>
                  {alive.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PredictionsTab
