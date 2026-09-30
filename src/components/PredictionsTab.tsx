import React, { useMemo, useState } from 'react'
import type { PlayerService, Player, ScoringCategoryId } from '../data/playerService'
import { MARKETS, MAX_STAKE, MIN_STAKE, WEEKLY_BUDGET, multiplierFor, riskFor, payoutFor, type Market } from '../data/predictions'
import { analyseCast, projectOdds, type Persona } from '../data/persona'

interface PredictionsTabProps {
  service: PlayerService
  players: Player[]
  currentManager: string | null
  managers: string[]
  onChangeManager: (name: string) => void
  episode: number
  onEpisodeChange: (n: number) => void
  onSetPrediction: (categoryId: ScoringCategoryId, targetPlayerId: number | null, stake: number) => void
  onInspect: (playerId: number) => void
}

const RISK_CLASS: Record<string, string> = {
  Low: 'risk-low', Medium: 'risk-med', High: 'risk-high', Extreme: 'risk-extreme',
}

/**
 * The prediction desk. Managers deploy a fixed weekly chip budget across five
 * markets; the desk projects a probability for every castaway from their CBS
 * bio, and picks settle automatically against the commissioner's scoring.
 *
 * Chips are deliberately a SEPARATE currency from league points - a bad
 * prediction week should sting without wrecking someone's actual standing.
 */
const PredictionsTab: React.FC<PredictionsTabProps> = ({
  service, players, currentManager, managers, onChangeManager,
  episode, onEpisodeChange, onSetPrediction, onInspect,
}) => {
  const [staged, setStaged] = useState<Record<string, { playerId: number; stake: number }>>({})
  const [openMarket, setOpenMarket] = useState<string | null>(null)

  const personas = useMemo(() => analyseCast(players), [players])
  const alive = players.filter(p => !p.votedOut)
  const locked = service.getMeta('predictions_locked') === 'true'

  const staked = currentManager ? service.getStaked(currentManager, episode) : 0
  const available = Math.max(0, WEEKLY_BUDGET - staked)
  const ledger = currentManager ? service.getLedger(currentManager, episode) : null
  const seasonPnl = currentManager ? service.getChipBalance(currentManager) : 0
  const net = ledger?.net ?? 0

  if (!currentManager) {
    return (
      <div className="tab-panel desk">
        <div className="desk-gate">
          <div className="desk-gate-ticker">PREDICTION DESK</div>
          <h2>Open a position</h2>
          <p>Choose your manager to deploy this week's chips across five markets.</p>
          <select
            className="select"
            value=""
            onChange={e => { if (e.target.value) onChangeManager(e.target.value) }}
          >
            <option value="">Choose your manager…</option>
            {managers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-panel desk">
      <div className="desk-head">
        <div className="desk-ticker">
          PREDICTION DESK
          <span className="desk-live">EP {episode}</span>
        </div>
        <div className="desk-controls">
          <select className="select" value={currentManager} aria-label="Manager"
            onChange={e => onChangeManager(e.target.value)}>
            {managers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="input desk-ep" type="number" min={1} value={episode}
            aria-label="Episode"
            onChange={e => onEpisodeChange(Math.max(1, Number(e.target.value) || 1))} />
        </div>
      </div>

      <div className="desk-wallet">
        <div className="wallet-cell">
          <div className="wallet-value">{WEEKLY_BUDGET}</div>
          <div className="wallet-label">weekly budget</div>
        </div>
        <div className="wallet-cell">
          <div className="wallet-value">{staked}</div>
          <div className="wallet-label">deployed</div>
        </div>
        <div className="wallet-cell wallet-free">
          <div className="wallet-value">{available}</div>
          <div className="wallet-label">available</div>
        </div>
        <div className="wallet-cell">
          <div className={`wallet-value${net < 0 ? ' neg' : ' pos'}`}>
            {net > 0 ? '+' : ''}{net}
          </div>
          <div className="wallet-label">settled</div>
        </div>
        <div className="wallet-cell">
          <div className={`wallet-value${seasonPnl < 0 ? ' neg' : ' pos'}`}>
            {seasonPnl > 0 ? '+' : ''}{seasonPnl}
          </div>
          <div className="wallet-label">season P&amp;L</div>
        </div>
      </div>

      <div className="desk-meter" aria-hidden="true">
        <div className="desk-meter-fill"
          style={{ width: `${Math.min(100, (staked / WEEKLY_BUDGET) * 100)}%` }} />
      </div>
      <p className="desk-note">
        {MIN_STAKE}-{MAX_STAKE} chips per market &middot; budgets reset every episode &middot;
        correct picks pay the multiplier &middot; chips never affect your league score.
        {locked && <strong> Market closed by the commissioner.</strong>}
      </p>

      {MARKETS.map(market => (
        <MarketCard
          key={market.id}
          market={market}
          service={service}
          players={players}
          alive={alive}
          personas={personas}
          manager={currentManager}
          episode={episode}
          locked={locked}
          isOpen={openMarket === market.id}
          staged={staged[market.id]}
          onToggle={() => setOpenMarket(openMarket === market.id ? null : market.id)}
          onStage={d => setStaged(prev => {
            const n = { ...prev }
            if (d) n[market.id] = d
            else delete n[market.id]
            return n
          })}
          onPlace={(playerId, stake) => {
            onSetPrediction(market.id, playerId, stake)
            setStaged(prev => { const n = { ...prev }; delete n[market.id]; return n })
            setOpenMarket(null)
          }}
          onInspect={onInspect}
        />
      ))}

      <section className="market">
        <header className="market-head">
          <div className="market-id">
            <span className="market-ticker">P&amp;L</span>
            <div>
              <div className="market-q">Season chip leaderboard</div>
              <div className="market-sub">Best predictor this season</div>
            </div>
          </div>
        </header>
        <div className="market-body">
          {service.getChipStandings().map((row, i) => (
            <div key={row.manager}
              className={`chip-row${row.manager === currentManager ? ' is-me' : ''}`}>
              <span className="chip-rank">{i + 1}</span>
              <span className="chip-name">{row.manager}</span>
              <span className={`chip-bal${row.balance < 0 ? ' neg' : ' pos'}`}>
                {row.balance > 0 ? '+' : ''}{row.balance}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** One market: risk band, the manager's ticket, and the odds board. */
const MarketCard: React.FC<{
  market: Market
  service: PlayerService
  players: Player[]
  alive: Player[]
  personas: Map<number, Persona>
  manager: string
  episode: number
  locked: boolean
  isOpen: boolean
  staged: { playerId: number; stake: number } | undefined
  onToggle: () => void
  onStage: (d: { playerId: number; stake: number } | undefined) => void
  onPlace: (playerId: number, stake: number) => void
  onInspect: (playerId: number) => void
}> = ({ market, service, players, alive, personas, manager, episode, locked,
        isOpen, staged, onToggle, onStage, onPlace, onInspect }) => {
  const ticket = service.getTicket(manager, episode, market.id)
  const mult = multiplierFor(market.id)
  const risk = riskFor(market.id)
  const nameOf = (id: number | null | undefined) =>
    id == null ? '—' : players.find(p => p.id === id)?.name ?? 'Unknown'

  return (
    <section className="market">
      <header
        className="market-head"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
      >
        <div className="market-id">
          <span className="market-ticker">{market.ticker}</span>
          <div>
            <div className="market-q">{market.question}</div>
            <div className="market-sub">{market.implied}</div>
          </div>
        </div>
        <div className="market-meta">
          <span className={`market-risk ${RISK_CLASS[risk]}`}>{risk}</span>
          <span className="market-mult">{mult}&times;</span>
        </div>
      </header>

      {ticket && (
        <div className={`ticket ticket-${ticket.result}`}>
          <span className="ticket-pick">{nameOf(ticket.targetPlayerId)}</span>
          <span className="ticket-stake">{ticket.stake}c</span>
          <span className="ticket-result">
            {ticket.result === 'open' && 'PENDING'}
            {ticket.result === 'hit' && `HIT +${ticket.payout}`}
            {ticket.result === 'miss' && 'MISS'}
          </span>
          {ticket.result === 'miss' && (
            <span className="ticket-winner">winner: {nameOf(ticket.winnerId)}</span>
          )}
        </div>
      )}

      {isOpen && (
        <div className="market-body">
          <p className="market-how">
            {market.howItSettles} Pays {mult}&times; your stake.
          </p>
          <div className="odds">
            {alive
              .slice()
              .sort((a, b) =>
                projectOdds(b, market.id, personas) - projectOdds(a, market.id, personas))
              .map(p => (
                <div key={p.id} className="odds-row">
                  <img src={p.photo} alt="" />
                  <div className="odds-id">
                    <div className="odds-name">{p.name}</div>
                    <div className="odds-read">
                      {personas.get(p.id)?.verdict ?? 'No read'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="odds-info"
                    onClick={() => onInspect(p.id)}
                    aria-label={`Why the desk rates ${p.name}`}
                  >?</button>
                  <div className="odds-bar" aria-hidden="true">
                    <div
                      className="odds-bar-fill"
                      style={{ width: `${projectOdds(p, market.id, personas)}%` }}
                    />
                  </div>
                  <div className="odds-num">
                    {projectOdds(p, market.id, personas)}%
                  </div>
                  <button
                    type="button"
                    className={`odds-buy${staged?.playerId === p.id ? ' is-staged' : ''}`}
                    disabled={locked}
                    onClick={() => onStage(
                      staged?.playerId === p.id
                        ? undefined
                        : { playerId: p.id, stake: MIN_STAKE },
                    )}
                  >
                    {staged?.playerId === p.id ? 'STAGED' : 'PICK'}
                  </button>
                </div>
              ))}
          </div>

          {staged && (
            <BetSlip
              market={market}
              staged={staged}
              available={Math.max(0, WEEKLY_BUDGET - service.getStaked(manager, episode))}
              locked={locked}
              onChange={onStage}
              onPlace={() => onPlace(staged.playerId, staged.stake)}
            />
          )}
        </div>
      )}
    </section>
  )
}

/** Stake stepper + confirm, shown once a name is staged. */
const BetSlip: React.FC<{
  market: Market
  staged: { playerId: number; stake: number }
  available: number
  locked: boolean
  onChange: (d: { playerId: number; stake: number } | undefined) => void
  onPlace: () => void
}> = ({ market, staged, available, locked, onChange, onPlace }) => {
  const maxHere = Math.min(MAX_STAKE, available)
  const stake = Math.min(
    Math.max(MIN_STAKE, staged.stake),
    Math.max(MIN_STAKE, maxHere),
  )
  const canBet = !locked && available >= MIN_STAKE

  return (
    <div className="slip">
      <div className="slip-head">
        <span>ORDER TICKET</span>
        <button
          type="button"
          className="slip-close"
          onClick={() => onChange(undefined)}
          aria-label="Discard ticket"
        >&times;</button>
      </div>
      <div className="slip-row">
        <label>Stake</label>
        <div className="slip-stake">
          <button
            type="button"
            disabled={stake <= MIN_STAKE}
            onClick={() => onChange({ ...staged, stake: stake - 5 })}
          >−</button>
          <span>{stake}</span>
          <button
            type="button"
            disabled={stake >= maxHere}
            onClick={() => onChange({ ...staged, stake: stake + 5 })}
          >+</button>
        </div>
      </div>
      <div className="slip-row">
        <label>Returns if right</label>
        <div className="slip-val pos">
          {stake} &rarr; <strong>{payoutFor(market.id, stake)}</strong> chips
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary slip-submit"
        disabled={!canBet}
        onClick={onPlace}
      >
        Place {stake} chip bet
      </button>
      {!canBet && <p className="slip-warn">Not enough chips left this week.</p>}
    </div>
  )
}

export default PredictionsTab