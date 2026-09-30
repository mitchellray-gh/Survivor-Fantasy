import React, { useMemo, useState } from 'react'
import type { PlayerService, Player } from '../data/playerService'
import { buildRecap, copyRecapText, groupLines } from '../data/recap'

interface RecapTabProps {
  service: PlayerService
  players: Player[]
  episode: number
  onEpisodeChange: (n: number) => void
  canEdit: boolean
  onSaveNote: (episode: number, note: string) => void
  /** Open the shared player detail sheet. */
  onInspect: (playerId: number) => void
  /**
   * Mutation counter from App. The service instance is stable, so React cannot
   * see that its internal event list changed; this is the invalidation key.
   */
  version: number
}

/**
 * The weekly recap. Reads like a league newsletter: what happened, who moved,
 * and how each castaway's season has trended. Everything is derived from the
 * scored events, so this can never disagree with the real standings.
 */
const RecapTab: React.FC<RecapTabProps> = ({
  service, players, episode, onEpisodeChange, canEdit, onSaveNote, version, onInspect,
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState(false)

  const episodes = service.getScoredEpisodes()
  const savedNote = service.getRecapNote(episode)
  const noteValue = draft ?? savedNote

  const nameOf = useMemo(
    () => (id: number) => players.find(p => p.id === id)?.name ?? `Player ${id}`,
    [players],
  )

  const recap = useMemo(
    () => buildRecap({
      episode,
      events: service.getEvents(),
      categories: service.getScoringCategories(),
      nameOf,
      seasonTotal: id => service.getPlayerTotal(id),
      historyFor: id => service.getPlayerEpisodeHistory(id),
      notes: savedNote,
    }),
    [service, episode, players, savedNote, version],
  )

  const groups = groupLines(recap.lines)

  // Every castaway, whether or not they moved this week.
  const table = useMemo(
    () => players.map(p => ({
      player: p,
      delta: service.getPlayerEpisodeTotal(p.id, episode),
      total: service.getPlayerTotal(p.id),
      history: service.getScoredEpisodes().map(e => service.getPlayerEpisodeTotal(p.id, e)),
    })).sort((a, b) => b.delta - a.delta || b.total - a.total),
    [service, players, episode, version],
  )

  const visible = showAll ? table : table.filter(r => r.delta !== 0).slice(0, 8)

  if (recap.lines.length === 0 && !savedNote) {
    return (
      <div className="tab-panel recap">
        <div className="recap-header">
          <h2>Weekly Recap</h2>
          <EpisodePicker episodes={episodes} episode={episode} onEpisodeChange={onEpisodeChange} />
        </div>
        <div className="recap-empty">
          <p>Nothing scored for episode {episode} yet.</p>
          <p className="drawer-help">
            Score the episode from the Score tab and the recap writes itself.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-panel recap">
      <div className="recap-header">
        <div>
          <h2>Episode {episode} Recap</h2>
          <p className="recap-sub">
            {recap.totalAwarded} points awarded across {recap.movers.length} castaways
          </p>
        </div>
        <div className="recap-header-actions">
          <button
            type="button"
            className="btn btn-neutral btn-sm"
            onClick={() => {
              void copyRecapText({
                episode, recap, players, nameOf,
                totalOf: (id) => service.getPlayerTotal(id),
              }).then(ok => {
                if (!ok) return
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
            }}
          >
            {copied ? 'Copied ✓' : 'Copy for chat'}
          </button>
          <EpisodePicker episodes={episodes} episode={episode} onEpisodeChange={onEpisodeChange} />
        </div>
      </div>

      {recap.top.length > 0 && (
        <div className="recap-movers">
          {recap.top.map(m => (
            <div key={m.playerId} className="recap-mover">
              <img src={players.find(p => p.id === m.playerId)?.photo} alt="" />
              <div className="recap-mover-id">
                <div className="recap-mover-name">{nameOf(m.playerId)}</div>
                <div className="recap-mover-total">{m.seasonTotal} season</div>
              </div>
              <div className={`recap-delta${m.delta < 0 ? ' neg' : ' pos'}`}>
                {m.delta > 0 ? '+' : ''}{m.delta}
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.map(g => (
        <section key={g.group} className="recap-group">
          <h3 className="recap-group-title">{g.group}</h3>
          {g.lines.map(line => (
            <article key={line.categoryId} className="recap-item">
              <div className="recap-item-head">
                <span className="recap-item-label">{line.categoryLabel}</span>
                <span className={`recap-item-pts${line.points < 0 ? ' neg' : ''}`}>
                  {line.points > 0 ? '+' : ''}{line.points}
                </span>
              </div>
              <p className="recap-item-text">{line.headline}</p>
              {line.playerIds.length > 0 && (
                <div className="recap-faces">
                  {line.playerIds.slice(0, 8).map(id => (
                    <img
                      key={id}
                      src={players.find(p => p.id === id)?.photo}
                      alt={nameOf(id)}
                      title={nameOf(id)}
                    />
                  ))}
                  {line.playerIds.length > 8 && (
                    <span className="recap-more">+{line.playerIds.length - 8}</span>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      ))}

      <section className="recap-group">
        <h3 className="recap-group-title">Commissioner's Notes</h3>
        {canEdit ? (
          <>
            <textarea
              className="input recap-note"
              rows={3}
              placeholder="Near-misses and colour. e.g. Lewis missed the idol on Exile Island."
              value={noteValue}
              onChange={e => setDraft(e.target.value)}
            />
            <div className="recap-note-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { onSaveNote(episode, noteValue.trim()); setDraft(null) }}
              >
                {draft === null ? 'Saved' : 'Save note'}
              </button>
              {draft !== null && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          savedNote
            ? <p className="recap-item-text">{savedNote}</p>
            : <p className="drawer-help">No notes for this episode.</p>
        )}
      </section>

      <section className="recap-group">
        <div className="recap-table-head">
          <h3 className="recap-group-title">Player Movement</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show movers only' : `Show all ${table.length}`}
          </button>
        </div>
        <div className="recap-rows">
          {visible.map(row => (
            <div key={row.player.id} className={`recap-row${row.delta === 0 ? ' is-flat' : ''}`}>
              <button
                type="button"
                className="recap-row-open"
                onClick={() => onInspect(row.player.id)}
                aria-label={`See ${row.player.name}'s points history`}
              >
                <img src={row.player.photo} alt="" />
                <div className="recap-row-id">
                  <div className="recap-row-name">{row.player.name}</div>
                  <div className="recap-row-mgr">{row.player.managerName}</div>
                </div>
              </button>
              <Sparkline values={row.history} />
              <div className="recap-row-total">{row.total}</div>
              <div className={`recap-delta${row.delta < 0 ? ' neg' : row.delta === 0 ? ' flat' : ' pos'}`}>
                {row.delta > 0 ? '+' : ''}{row.delta}
              </div>
            </div>
          ))}
          {visible.length === 0 && <p className="drawer-help">Nobody moved this week.</p>}
        </div>
      </section>
    </div>
  )
}

/** Episode selector, showing only episodes that have data. */
const EpisodePicker: React.FC<{
  episodes: number[]
  episode: number
  onEpisodeChange: (n: number) => void
}> = ({ episodes, episode, onEpisodeChange }) => {
  if (episodes.length === 0) return null
  return (
    <div className="recap-picker">
      {episodes.map(e => (
        <button
          key={e}
          type="button"
          className={`recap-pill${e === episode ? ' is-active' : ''}`}
          onClick={() => onEpisodeChange(e)}
        >
          EP {e}
        </button>
      ))}
    </div>
  )
}

/**
 * Season trend for one player: one bar per episode, scaled to the biggest
 * swing so shapes are comparable across rows.
 */
const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length === 0) return <div className="spark is-empty" />
  const max = Math.max(...values.map(Math.abs), 1)
  return (
    <div className="spark" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`spark-bar${v < 0 ? ' is-neg' : v === 0 ? ' is-zero' : ''}`}
          style={{ height: `${Math.max(3, (Math.abs(v) / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export default RecapTab