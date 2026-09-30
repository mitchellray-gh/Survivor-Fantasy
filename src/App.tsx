import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import MyLeague from './components/MyLeague'
import PlayerCard from './components/PlayerCard'
import PredictionsTab from './components/PredictionsTab'
import RecapTab from './components/RecapTab'
import ScoringTab from './components/ScoringTab'
import TribesPanel from './components/TribesPanel'
import TabBar, { type TabId } from './components/TabBar'
import { PlayerService, type ScoringCategoryId, type PlayerStatus } from './data/playerService'
import { getAdminKey } from './data/storage'
import AdminDrawer from './components/AdminDrawer'
import Dossier from './components/Dossier'
import './App.css'

const GROUPS = ['Survival','Challenge','Advantage','Social & Drama'] as const

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
  players:     'Castaways',
  tribes:      'Tribes',
  teams:       'Teams',
  recap:       'Recap',
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
    setRecapEpisode(ep)
  }, [hydrated, service])

  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  // All three episode inputs default to the league's current episode, so the
  // commissioner's Season Settings drives Score, Predict and Recap together.
  const [scoringEpisode, setScoringEpisode] = useState(() => service.getCurrentEpisode())
  const [predictionEpisode, setPredictionEpisode] = useState(() => service.getCurrentEpisode())
  const [recapEpisode, setRecapEpisode] = useState(() => service.getCurrentEpisode())
  const [predictionManager, setPredictionManager] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [myManager, setMyManager] = useState<string | null>(loadMyManager)

  const onSelectManager = (name: string) => {
    setMyManager(name); saveMyManager(name); bump()
  }
  const onClearManager = () => {
    setMyManager(null); saveMyManager(null); bump()
  }

  const players = service.getPlayers()
  const managers = service.getManagers()
  const cats = service.getScoringCategories()

  const onVoteOut = (id: number) => { service.voteOutPlayer(id); bump() }
  const onUnvoteOut = (id: number) => { service.unvoteOutPlayer(id); bump() }
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

  // "Why does the desk like them?" - opens a persona dossier in the drawer.
  const [dossierPlayerId, setDossierPlayerId] = useState<number | null>(null)
  const dossierPlayer = dossierPlayerId == null ? null : players.find(p => p.id === dossierPlayerId) ?? null

  const standings = useMemo(() => {
    void version
    return managers.map(m => ({
      name: m.name, players: m.players,
      total: service.getManagerTotal(m.name),
      remaining: m.players.filter(p => !p.votedOut).length,
    })).sort((a, b) => b.total - a.total || b.remaining - a.remaining || a.name.localeCompare(b.name))
  }, [managers, service, version])

  const storageBadge = (
    <span
      className={`storage-badge ${service.isRemote() ? 'remote' : 'local'}`}
      title={service.isRemote() ? 'Shared league database' : 'Local to this browser only'}
    >
      <span className="badge-dot" aria-hidden="true" />
      {!hydrated ? 'Loading\u2026' : service.isRemote() ? 'Synced' : 'Local'}
    </span>
  )

  return (
    <div className="app">
      <Header title={TAB_TITLES[activeTab]} subtitle="Survivor Season 51" right={storageBadge} onOpenAdmin={() => setAdminOpen(true)} />

      <main className="app-main">
        {activeTab === 'dashboard' && (
          <section className="tab-panel">
            <MyLeague
              service={service}
              selected={myManager}
              managers={managers.map(m => m.name)}
              onSelect={onSelectManager}
              onChange={onClearManager}
            />

            <div className="hero-note">Season 51 premieres Wed Sept 23, 2026 on CBS &amp; Paramount+.</div>

            <div className="list-card">
              {standings.map((s, i) => (
                <div key={s.name} className="standings-row">
                  <div className={`rank rank-${Math.min(i + 1, 4)}`}>{i + 1}</div>
                  <div className="standings-main">
                    <div className="standings-name">{s.name}</div>
                    <div className="standings-meta">{s.remaining}/{s.players.length} alive</div>
                  </div>
                  <div className="standings-pts">
                    <span className="pts-value">{s.total}</span>
                    <span className="pts-label">pts</span>
                  </div>
                </div>
              ))}
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
            <div className="list-card">
              {players.map(p => (
                <PlayerCard key={p.id} player={p} managerLabel={p.managerName} totalPoints={service.getPlayerTotal(p.id)} onVoteOut={onVoteOut} onUnvoteOut={onUnvoteOut} showVoteControls />
              ))}
            </div>
          </section>
        )}

        {activeTab === 'tribes' && (
          <section className="tab-panel">
            <div className="hero-note">
              The cast is split into competing tribes. Tribal loyalty is the
              strategic core of Survivor, so a rival drafted onto your tribe is
              a real cost.
            </div>
            <TribesPanel service={service} onVoteOut={onVoteOut} onUnvoteOut={onUnvoteOut} />
          </section>
        )}

        {activeTab === 'teams' && (
          <section className="tab-panel">
            {managers.map(m => (
              <div key={m.name} className="team-block">
                <div className="team-header">
                  <div className="team-header-main">
                    <h3>{m.name}</h3>
                    <div className="team-sub">{m.players.filter(p => !p.votedOut).length}/{m.players.length} alive</div>
                  </div>
                  <div className="team-pts">
                    <span className="pts-value">{service.getManagerTotal(m.name)}</span>
                    <span className="pts-label">pts</span>
                  </div>
                </div>
                <div className="list-card">
                  {m.players.map(p => (
                    <PlayerCard key={p.id} player={p} managerLabel={m.name} totalPoints={service.getPlayerTotal(p.id)} onVoteOut={onVoteOut} onUnvoteOut={onUnvoteOut} showVoteControls />
                  ))}
                </div>
              </div>
            ))}
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

      <TabBar active={activeTab} onChange={setActiveTab} counts={{ players: players.length, teams: managers.length }} />

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