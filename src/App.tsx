import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import MyLeague from './components/MyLeague'
import PlayerCard from './components/PlayerCard'
import PredictionsTab from './components/PredictionsTab'
import RecapTab from './components/RecapTab'
import SaveAlert from './components/SaveAlert'
import ScoringTab from './components/ScoringTab'
import PlayerSheet from './components/PlayerSheet'
import { TRIBES, type TribeId } from './data/tribes'
import TabBar, { type TabId } from './components/TabBar'
import { PlayerService, type ScoringCategoryId, type PlayerStatus } from './data/playerService'
import { getAdminKey, onFailedWrite, type FailedWrite } from './data/storage'
import AdminDrawer from './components/AdminDrawer'
import Dossier from './components/Dossier'
import './App.css'

const GROUPS = ['Survival','Challenge','Advantage','Social & Drama'] as const

/** Sort orders offered on the cast list. */
type CastSort = 'tribe' | 'status' | 'points' | 'name'

const CAST_SORTS: Array<{ id: CastSort; label: string }> = [
  { id: 'tribe',  label: 'Tribe' },
  { id: 'status', label: 'Status' },
  { id: 'points', label: 'Points' },
  { id: 'name',   label: 'A-Z' },
]

/**
 * "Who am I?" is remembered in localStorage so a manager only picks once.
 * Read lazily so a first visit (no key yet) still starts empty rather than
 * throwing during module init.
 */
const MY_MANAGER_KEY = 'survivor_fantasy_my_manager'

function loadMyManager(): string | null {
  try {
    return localStorage.getItem(MY_MANAGER_KEY)
  } catch {
    return null // private mode / storage blocked
  }
}

function saveMyManager(name: string | null): void {
  try {
    if (name) localStorage.setItem(MY_MANAGER_KEY, name)
    else localStorage.removeItem(MY_MANAGER_KEY)
  } catch {
    // Non-fatal: they just re-pick next time.
  }
}
const TAB_TITLES: Record<TabId, string> = {
  dashboard:   'Standings',
  recap:       'Recap',
  players:     'Castaways',
  predictions: 'Predictions',
  scoring:     'Score Episode',
}

function App() {
  const [service] = useState(() => new PlayerService())
  const [version, setVersion] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const bump = () => setVersion(v => v + 1)

  useEffect(() => {
    let cancelled = false
    void service.hydrate().finally(() => { if (!cancelled) { setHydrated(true); bump() } })
    return () => { cancelled = true }
  }, [service])

  // The initial useState calls above run before hydrate() has loaded meta, so
  // they always start at 1. Re-sync once the real current episode is known.
  useEffect(() => {
    if (!hydrated) return
    const ep = service.getCurrentEpisode()
    setScoringEpisode(ep)
    setPredictionEpisode(ep)
    // Recap deliberately follows the last SCORED episode instead: the recap is
    // a look back, and pointing it at an unscored episode shows an empty page.
    const scored = service.getScoredEpisodes()
    setRecapEpisode(scored.length > 0 ? scored[scored.length - 1] : ep)
  }, [hydrated, service])

  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  // All three episode inputs default to the league's current episode, so the
  // commissioner's Season Settings drives Score, Predict and Recap together.
  const [scoringEpisode, setScoringEpisode] = useState(() => service.getCurrentEpisode())
  const [predictionEpisode, setPredictionEpisode] = useState(() => service.getCurrentEpisode())
  // Recap is a look BACK, so it opens on the most recent scored episode
  // (episode 1 while episode 2 is still unscored) rather than the live one.
  const [recapEpisode, setRecapEpisode] = useState(() => {
    const scored = service.getScoredEpisodes()
    return scored.length > 0 ? scored[scored.length - 1] : service.getCurrentEpisode()
  })
  const [predictionManager, setPredictionManager] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [myManager, setMyManager] = useState<string | null>(loadMyManager)

  // Cast tab filters. Tribes and Teams were separate tabs; both are folded in
  // here as filters so the bottom bar stays at five.
  const [castTribe, setCastTribe] = useState<TribeId | null>(null)
  const [castManager, setCastManager] = useState<string | null>(null)
  const [castSort, setCastSort] = useState<CastSort>('tribe')
  const [expandedManager, setExpandedManager] = useState<string | null>(null)

  const onSelectManager = (name: string) => {
    setMyManager(name); saveMyManager(name); bump()
  }
  const onClearManager = () => {
    setMyManager(null); saveMyManager(null); bump()
  }

  // Clears a pending confirm when the user navigates away from it.
  useEffect(() => { setConfirmVoteOut(null) }, [activeTab])

  const players = service.getPlayers()
  const managers = service.getManagers()
  const cats = service.getScoringCategories()

  // Vote-out is destructive and reachable in two places, so a stray tap mid
  // scroll could permanently change someone's status. Confirm the first tap.
  const [confirmVoteOut, setConfirmVoteOut] = useState<number | null>(null)

  const onVoteOut = (id: number) => {
    if (confirmVoteOut === id) {
      service.voteOutPlayer(id)
      setConfirmVoteOut(null)
    } else {
      setConfirmVoteOut(id)
      return
    }
    bump()
  }
  const onUnvoteOut = (id: number) => {
    setConfirmVoteOut(null)
    service.unvoteOutPlayer(id); bump()
  }
  const onToggleEvent = (playerId: number, catId: ScoringCategoryId) => {
    service.toggleEvent(playerId, scoringEpisode, catId); bump()
  }

  const onPlayerStatusChange = (playerId: number, status: PlayerStatus) => {
    service.setPlayerStatus(playerId, status); bump()
  }

  const onOverrideChange = (playerId: number, episode: number, delta: number, reason: string | null) => {
    service.setOverride(playerId, episode, delta, reason); bump()
  }

  const onSetPrediction = (catId: ScoringCategoryId, targetPlayerId: number | null, stake: number) => {
    if (!predictionManager) return
    service.setPrediction(predictionManager, predictionEpisode, catId, targetPlayerId, stake); bump()
  }

  // ---- Failed writes + resync ----------------------------------------------
  const [failures, setFailures] = useState<FailedWrite[]>([])

  useEffect(() => onFailedWrite(setFailures), [])

  /**
   * Re-read authoritative state. Used after a discarded/retry failure so the
   * UI stops showing an optimistic change that never persisted.
   */
  const resync = () => {
    void service.hydrate().then(bump).catch(() => bump())
  }

  // "Why does the desk like them?" - opens a persona dossier in the drawer.
  const [dossierPlayerId, setDossierPlayerId] = useState<number | null>(null)
  const dossierPlayer = dossierPlayerId == null ? null : players.find(p => p.id === dossierPlayerId) ?? null

  // Shared player detail sheet, reachable from cast, rosters, recap and desk.
  const [inspectId, setInspectId] = useState<number | null>(null)
  const inspectPlayer = inspectId == null ? null : players.find(p => p.id === inspectId) ?? null
  const setInspectPlayer = (id: number) => { setInspectId(id); setDossierPlayerId(null) }

  const standings = useMemo(() => {
    void version
    return managers.map(m => ({
      name: m.name, players: m.players,
      total: service.getManagerTotal(m.name),
      remaining: m.players.filter(p => !p.votedOut).length,
    })).sort((a, b) => b.total - a.total || b.remaining - a.remaining || a.name.localeCompare(b.name))
  }, [managers, service, version])

  const castVisible = useMemo(() => {
    void version
    const filtered = players.filter(p =>
      (castTribe === null || p.tribe === castTribe) &&
      (castManager === null || p.managerName === castManager))

    // Tribe order follows the data (Savu, Toka, Exile) rather than the alphabet.
    const tribeRank = new Map(TRIBES.map((t, i) => [t.id, i]))

    return filtered.slice().sort((a, b) => {
      // "Alive first" is the default on every sort: a castaway still in the
      // game is the one you care about, so the eliminated sink.
      if (a.votedOut !== b.votedOut) return a.votedOut ? 1 : -1

      switch (castSort) {
        case 'tribe': {
          const ra = tribeRank.get(a.tribe ?? 'exile') ?? 99
          const rb = tribeRank.get(b.tribe ?? 'exile') ?? 99
          if (ra !== rb) return ra - rb
          return a.name.localeCompare(b.name)
        }
        case 'status': {
          const sa = a.status ?? 'active'
          const sb = b.status ?? 'active'
          if (sa !== sb) return sa.localeCompare(sb)
          return a.name.localeCompare(b.name)
        }
        case 'points': {
          const d = service.getPlayerTotal(b.id) - service.getPlayerTotal(a.id)
          return d !== 0 ? d : a.name.localeCompare(b.name)
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }, [players, castTribe, castManager, castSort, service, version])

  // The episode the league is officially on, and whether the tab you're looking
  // at has drifted from it.
  const leagueEpisode = hydrated ? service.getCurrentEpisode() : 1
  const activeTabEpisode =
    activeTab === 'scoring' ? scoringEpisode
    : activeTab === 'predictions' ? predictionEpisode
    : null // recap intentionally sits on the last scored episode, not the live one
  const showEpisodePill = activeTabEpisode !== null && activeTabEpisode !== leagueEpisode

  const storageBadge = (
    <span
      className={`storage-badge ${service.isRemote() ? 'remote' : 'local'}${failures.length > 0 ? ' is-error' : ''}`}
      title={
        failures.length > 0
          ? `${failures.length} change(s) failed to save`
          : service.isRemote()
            ? `Shared league database - now on Episode ${leagueEpisode}`
            : 'Local to this browser only'
      }
    >
      <span className="badge-dot" aria-hidden="true" />
      {!hydrated ? 'Loading\u2026'
        : failures.length > 0 ? `${failures.length} unsaved`
        : service.isRemote() ? 'Synced' : 'Local'}
    </span>
  )

  return (
    <div className="app">
      <Header
        title={TAB_TITLES[activeTab]}
        subtitle="Survivor Season 51"
        right={(
          <span className="header-right-group">
            {showEpisodePill && (
              <button
                type="button"
                className="episode-pill is-drift"
                onClick={() => {
                  setScoringEpisode(leagueEpisode)
                  setPredictionEpisode(leagueEpisode)
                  setRecapEpisode(leagueEpisode)
                }}
                title="Jump back to the current episode"
              >
                EP {activeTabEpisode} &rarr; EP {leagueEpisode}
              </button>
            )}
            {storageBadge}
          </span>
        )}
        onOpenAdmin={() => setAdminOpen(true)}
      />

      <SaveAlert failures={failures} onResync={resync} />

      <main className="app-main">
        {activeTab === 'dashboard' && (
          <section className="tab-panel">
            <MyLeague
              service={service}
              selected={myManager}
              managers={managers.map(m => m.name)}
              onSelect={onSelectManager}
              onChange={onClearManager}
              onInspect={setInspectPlayer}
            />

            <div className="hero-note">Season 51 premieres Wed Sept 23, 2026 on CBS &amp; Paramount+.</div>

            <div className="list-card">
              {standings.map((s, i) => {
                const open = expandedManager === s.name
                return (
                  <div key={s.name} className="standings-group">
                    <button
                      type="button"
                      className="standings-row standings-toggle"
                      onClick={() => setExpandedManager(open ? null : s.name)}
                      aria-expanded={open}
                    >
                      <div className={`rank rank-${Math.min(i + 1, 4)}`}>{i + 1}</div>
                      <div className="standings-main">
                        <div className="standings-name">{s.name}</div>
                        <div className="standings-meta">
                          {s.remaining}/{s.players.length} alive
                        </div>
                      </div>
                      <div className="standings-pts">
                        <span className="pts-value">{s.total}</span>
                        <span className="pts-label">pts</span>
                      </div>
                      <span className={`standings-caret${open ? ' is-open' : ''}`} aria-hidden="true">›</span>
                    </button>
                    {open && (
                      <div className="standings-roster">
                        {s.players.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className={`mini-player${p.votedOut ? ' is-out' : ''}`}
                            onClick={() => setInspectPlayer(p.id)}
                          >
                            <img src={p.photo} alt="" />
                            <div className="mini-player-id">
                              <div className="mini-player-name">{p.name}</div>
                              <div className="mini-player-tribe">
                                {p.tribe ?? 'exile'}
                              </div>
                            </div>
                            <div className="mini-player-pts">
                              {service.getPlayerTotal(p.id)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <details className="rules-details" open={rulesOpen} onToggle={e => setRulesOpen((e.target as HTMLDetailsElement).open)}>
              <summary>Scoring rules</summary>
              <div className="rules-grid">
                {GROUPS.map(group => (
                  <div key={group} className="rule-group">
                    <h4>{group}</h4>
                    <ul>
                      {cats.filter(c => c.group === group).map(c => (
                        <li key={c.id}>
                          <span className={`pts-badge ${c.points >= 0 ? 'pos' : 'neg'}`}>{c.points >= 0 ? '+' : ''}{c.points}</span>
                          <span className="rule-label">{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}

        {activeTab === 'players' && (
          <section className="tab-panel">
            <div className="cast-filters">
              <div className="cast-filter-row">
                <span className="cast-filter-label">Tribe</span>
                <div className="cast-chips">
                  <button
                    type="button"
                    className={`cast-chip${castTribe === null ? ' is-active' : ''}`}
                    onClick={() => setCastTribe(null)}
                  >
                    All
                  </button>
                  {service.getTribes().map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`cast-chip${castTribe === t.id ? ' is-active' : ''}`}
                      style={{ '--tribe-color': t.color } as React.CSSProperties}
                      onClick={() => setCastTribe(castTribe === t.id ? null : t.id)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cast-filter-row">
                <span className="cast-filter-label">Manager</span>
                <div className="cast-chips">
                  <button
                    type="button"
                    className={`cast-chip${castManager === null ? ' is-active' : ''}`}
                    onClick={() => setCastManager(null)}
                  >
                    All
                  </button>
                  {managers.map(m => (
                    <button
                      key={m.name}
                      type="button"
                      className={`cast-chip${castManager === m.name ? ' is-active' : ''}`}
                      onClick={() => setCastManager(castManager === m.name ? null : m.name)}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cast-filter-row">
                <span className="cast-filter-label">Sort by</span>
                <div className="cast-chips">
                  {CAST_SORTS.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`cast-chip${castSort === s.id ? ' is-active' : ''}`}
                      onClick={() => setCastSort(s.id)}
                      aria-pressed={castSort === s.id}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="cast-count">
              {castVisible.length} of {players.length} castaways
              <span className="cast-out-note">
                {players.filter(p => p.votedOut).length} out
              </span>
            </div>

            <div className="list-card">
              {castVisible.map(p => (
                <PlayerCard key={p.id} player={p} managerLabel={p.managerName} totalPoints={service.getPlayerTotal(p.id)} onVoteOut={onVoteOut} onUnvoteOut={onUnvoteOut} confirmingVoteOut={confirmVoteOut === p.id} onInspect={setInspectPlayer} showVoteControls />
              ))}
              {castVisible.length === 0 && (
                <p className="cast-empty">No castaways match those filters.</p>
              )}
            </div>
          </section>
        )}

        {activeTab === 'recap' && (
          <RecapTab
            service={service}
            players={players}
            episode={recapEpisode}
            onEpisodeChange={setRecapEpisode}
            canEdit={getAdminKey().length > 0}
            onSaveNote={(ep, note) => { service.setRecapNote(ep, note); bump() }}
            version={version}
            onInspect={setInspectPlayer}
          />
        )}

        {activeTab === 'predictions' && (
          <PredictionsTab
            service={service}
            players={players}
            currentManager={predictionManager}
            managers={managers.map(m => m.name)}
            onChangeManager={setPredictionManager}
            episode={predictionEpisode}
            onEpisodeChange={setPredictionEpisode}
            onSetPrediction={onSetPrediction}
            onInspect={setDossierPlayerId}
          />
        )}

        {activeTab === 'scoring' && (
          <section className="tab-panel">
            <ScoringTab
              service={service}
              players={players}
              scoringCategories={cats}
              episode={scoringEpisode}
              onEpisodeChange={setScoringEpisode}
              onToggleEvent={onToggleEvent}
              needsAdminKey={service.isRemote()}
              onOpenAdmin={() => setAdminOpen(true)}
            />
          </section>
        )}
      </main>

      <TabBar active={activeTab} onChange={setActiveTab} counts={{ players: players.length, scoring: service.getScoredEpisodes().length }} />

      <AdminDrawer
        isOpen={adminOpen}
        onClose={() => setAdminOpen(false)}
        players={players}
        onPlayerStatusChange={onPlayerStatusChange}
        onOverrideChange={onOverrideChange}
        service={service}
        currentEpisode={scoringEpisode}
        onSettingsChanged={bump}
      />

      {/* Player detail: reachable from any castaway listing. */}
      {inspectPlayer && (
        <PlayerSheet
          player={inspectPlayer}
          service={service}
          onClose={() => setInspectId(null)}
          onOpenRecap={(ep) => { setRecapEpisode(ep); setInspectId(null); setActiveTab('recap') }}
        />
      )}

      {/* Persona dossier: opened from the "?" on any odds row. */}
      {dossierPlayer && (
        <div className="drawer-backdrop" onClick={() => setDossierPlayerId(null)}>
          <div className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 className="drawer-title">Desk Read</h2>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setDossierPlayerId(null)} aria-label="Close">&times;</button>
            </div>
            <div className="drawer-body">
              <Dossier
                player={dossierPlayer}
                players={players}
                onClose={() => setDossierPlayerId(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App