import React from 'react'
import type { PlayerService, Player } from '../data/playerService'
import { getTribe } from '../data/tribes'

interface PlayerSheetProps {
  player: Player
  service: PlayerService
  onClose: () => void
  /** Jump to this player's row in the recap for the tapped episode. */
  onOpenRecap?: (episode: number) => void
}

/**
 * Player detail. Reachable from anywhere a castaway is listed - cast, roster,
 * recap movers, prediction odds - so "how is my pick doing?" is one tap from
 * every surface in the app rather than only the one place it was wired into.
 */
const PlayerSheet: React.FC<PlayerSheetProps> = ({ player, service, onClose, onOpenRecap }) => {
  const d = service.getPlayerDetail(player.id)
  if (!d) return null

  const tribe = player.tribe ? getTribe(player.tribe) : undefined
  const status = player.status ?? 'active'
  const scoredWeeks = d.episodes.filter(e => e.delta !== 0).length

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}>
        <div className="drawer" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <h2 className="drawer-title">Castaway</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>

          <div className="drawer-body">
            {/* ---- Identity ---- */}
            <div className="psheet-head">
              <img src={player.photo} alt="" />
              <div className="psheet-id">
                <div className="psheet-name">{player.name}</div>
                <div className="psheet-sub">
                  {d.managerName}
                  {tribe && <> &middot; {tribe.name} ({tribe.colorName})</>}
                </div>
                <div className={`psheet-status is-${status}`}>
                  {status.replace('_', ' ')}
                </div>
              </div>
            </div>

            {/* ---- Headline numbers ---- */}
            <div className="psheet-stats">
              <div className="psheet-stat psheet-stat-hero">
                <div className="psheet-stat-value">{d.total}</div>
                <div className="psheet-stat-label">season points</div>
              </div>
              <div className="psheet-stat">
                <div className="psheet-stat-value">{d.episodes.length}</div>
                <div className="psheet-stat-label">episodes</div>
              </div>
              <div className="psheet-stat">
                <div className="psheet-stat-value">{scoredWeeks}</div>
                <div className="psheet-stat-label">scoring</div>
              </div>
            </div>

            {/* ---- Season trend ---- */}
            {d.episodes.length > 0 && (
              <section className="psheet-section">
                <h3 className="psheet-section-title">Points by episode</h3>
                <div className="psheet-chart">
                  {d.episodes.map(e => {
                    const max = Math.max(...d.episodes.map(x => Math.abs(x.delta)), 1)
                    return (
                      <button
                        key={e.episode}
                        type="button"
                        className="psheet-bar"
                        onClick={() => onOpenRecap?.(e.episode)}
                        title={`Episode ${e.episode}: ${e.delta > 0 ? '+' : ''}${e.delta} (${e.total} total)`}
                      >
                        <span className="psheet-bar-value">
                          {e.delta > 0 ? '+' : ''}{e.delta}
                        </span>
                        <span className="psheet-bar-track">
                          <span
                            className={`psheet-bar-fill${e.delta < 0 ? ' is-neg' : e.delta === 0 ? ' is-zero' : ''}`}
                            style={{ height: `${Math.max(4, (Math.abs(e.delta) / max) * 100)}%` }}
                          />
                        </span>
                        <span className="psheet-bar-ep">E{e.episode}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ---- Per-episode breakdown ---- */}
            {d.episodes.map(e => (
              <section key={e.episode} className="psheet-section">
                <h3 className="psheet-section-title">
                  Episode {e.episode}
                  <span className={`psheet-delta${e.delta < 0 ? ' neg' : e.delta === 0 ? ' flat' : ' pos'}`}>
                    {e.delta > 0 ? '+' : ''}{e.delta}
                  </span>
                  <span className="psheet-running">{e.total} total</span>
                </h3>
                {e.breakdown.length === 0 ? (
                  <p className="drawer-help">Nothing scored this episode.</p>
                ) : (
                  <ul className="psheet-breakdown">
                    {e.breakdown.map((b, i) => (
                      <li key={`${b.categoryId}-${i}`}>
                        <span className="psheet-b-label">{b.label}</span>
                        {b.count > 1 && <span className="psheet-b-count">&times;{b.count}</span>}
                        <span className={`psheet-b-pts${b.points < 0 ? ' neg' : ''}`}>
                          {b.points > 0 ? '+' : ''}{b.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {/* ---- Bio ---- */}
            {player.aboutMe && (
              <section className="psheet-section">
                <h3 className="psheet-section-title">Bio</h3>
                <p className="psheet-bio">{player.aboutMe}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default PlayerSheet
