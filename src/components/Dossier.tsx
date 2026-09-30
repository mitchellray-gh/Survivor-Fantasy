import React from 'react'
import type { Player } from '../data/playerService'
import { MARKETS } from '../data/predictions'
import { analyseCast, projectOdds } from '../data/persona'

interface DossierProps {
  player: Player
  players: Player[]
  onClose: () => void
}

/**
 * "Why does the desk rate them this way?" - the full persona read for one
 * castaway. Every quote is lifted verbatim from their own CBS bio so the
 * reasoning is checkable rather than magic.
 */
const Dossier: React.FC<DossierProps> = ({ player, players, onClose }) => {
  const personas = analyseCast(players)
  const p = personas.get(player.id)

  return (
    <div className="dossier">
      <div className="dossier-head">
        <img src={player.photo} alt="" />
        <div>
          <div className="dossier-name">{player.name}</div>
          <div className="dossier-verdict">{p?.verdict ?? 'No read available.'}</div>
        </div>
      </div>

      {p && (
        <>
          <div className="dossier-heat">
            <span className="dossier-signal-label">Heat</span>
            <div className="dossier-heat-bar">
              <div className="dossier-heat-fill" style={{ width: `${p.heat}%` }} />
            </div>
            <span className="dossier-signal-num">{p.heat}</span>
          </div>

          {p.signals.length === 0 && (
            <p className="drawer-help">
              Nothing in this bio tripped a signal. The desk has no read.
            </p>
          )}

          {p.signals.map(s => (
            <div key={s.key} className="dossier-signal">
              <div className="dossier-signal-top">
                <span className="dossier-signal-label">{s.label}</span>
                <span className="dossier-signal-num">{s.strength}%</span>
              </div>
              <div className="dossier-signal-blurb">{s.blurb}</div>
              {s.quote && <div className="dossier-quote">&ldquo;{s.quote}&rdquo;</div>}
            </div>
          ))}

          <div className="dossier-odds">
            {MARKETS.map(m => (
              <div key={m.id} className="dossier-odds-row">
                <span>{m.question.replace('Who ', 'Who wins ')}</span>
                <strong>{projectOdds(player, m.id, personas)}%</strong>
              </div>
            ))}
          </div>
        </>
      )}

      <button type="button" className="btn btn-neutral" onClick={onClose}>Close</button>
    </div>
  )
}

export default Dossier
