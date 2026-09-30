import React from 'react'
import type { PlayerService } from '../data/playerService'

interface MyLeagueProps {
  service: PlayerService
  /** The manager the viewer picked, or null before they choose. */
  selected: string | null
  managers: string[]
  onSelect: (name: string) => void
  onChange: () => void
  /** Open the shared player detail sheet. */
  onInspect: (playerId: number) => void
}

/**
 * "My League" panel at the top of the home tab. Every manager opens the same
 * app, so the first question is always "whose team am I looking at?" - the
 * picker persists across visits so nobody has to choose on every refresh.
 */
const MyLeague: React.FC<MyLeagueProps> = ({
  service, selected, managers, onSelect, onChange, onInspect,
}) => {
  if (!selected) {
    return (
      <div className="myleague myleague-empty">
        <div className="myleague-pick">
          <label htmlFor="my-manager">Who are you?</label>
          <select
            id="my-manager"
            className="select"
            value=""
            onChange={e => { if (e.target.value) onSelect(e.target.value) }}
          >
            <option value="">Choose your manager…</option>
            {managers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <p className="drawer-help">
          Pick your name to see your team's points, your rank, and who is
          competing for the same tribes as you.
        </p>
      </div>
    )
  }

  const s = service.getManagerStats(selected)

  return (
    <div className="myleague">
      <div className="myleague-pick">
        <label htmlFor="my-manager">Viewing as</label>
        <select
          id="my-manager"
          className="select"
          value={selected}
          onChange={e => onSelect(e.target.value)}
        >
          {managers.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onChange}>
          Change
        </button>
      </div>

      <div className="myleague-stats">
        <div className="my-stat my-stat-hero">
          <div className="my-stat-value">{s.total}</div>
          <div className="my-stat-label">points</div>
        </div>
        <div className="my-stat">
          <div className="my-stat-value">
            {s.tied > 1 ? `T-${s.rank}` : `#${s.rank}`}
          </div>
          <div className="my-stat-label">of {s.of} managers</div>
        </div>
        <div className="my-stat">
          <div className="my-stat-value">{s.alive}<span>/{s.rosterSize}</span></div>
          <div className="my-stat-label">still in</div>
        </div>
        <div className="my-stat">
          <div className="my-stat-value">{s.scored}</div>
          <div className="my-stat-label">scoring</div>
        </div>
      </div>

      <div className="myleague-roster">
        <div className="myleague-sub">Your cast</div>
        {s.players.map(({ player, total }) => (
          <button
            key={player.id}
            type="button"
            className={`my-player${player.votedOut ? ' is-out' : ''}`}
            onClick={() => onInspect(player.id)}
          >
            <img src={player.photo} alt="" />
            <div className="my-player-id">
              <div className="my-player-name">{player.name}</div>
              <div className="my-player-tribe">
                {player.status && player.status !== 'active' ? player.status.replace('_', ' ') : 'active'}
              </div>
            </div>
            <div className={`my-player-pts${total < 0 ? ' neg' : ''}`}>{total}</div>
          </button>
        ))}
      </div>

      {s.tribeClashes.length > 0 && (
        <div className="myleague-clashes">
          <div className="myleague-sub">Tribes you share with rivals</div>
          {s.tribeClashes.map(({ tribe, rivals }) => (
            <div
              key={tribe.id}
              className="my-clash"
              style={{ '--tribe-color': tribe.color } as React.CSSProperties}
            >
              <div className="my-clash-name">
                {tribe.name} <span>({tribe.colorName})</span>
              </div>
              <div className="my-clash-rivals">
                {rivals.map(p => (
                  <span key={p.id} className="my-clash-chip" title={p.managerName}>
                    {p.name.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MyLeague