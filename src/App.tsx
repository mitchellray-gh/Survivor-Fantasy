import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import PlayerCard from './components/PlayerCard'
import PredictionsTab from './components/PredictionsTab'
import ScoringTab from './components/ScoringTab'
import TribesPanel from './components/TribesPanel'
import TabBar, { type TabId } from './components/TabBar'
import { PlayerService, type ScoringCategoryId, type PlayerStatus } from './data/playerService'
import AdminDrawer from './components/AdminDrawer'
import './App.css'

const GROUPS = ['Survival','Challenge','Advantage','Social & Drama'] as const
const TAB_TITLES: Record<TabId, string> = {
  dashboard:   'Standings',
  players:     'Castaways',
  tribes:      'Tribes',
  teams:       'Teams',
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

  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [scoringEpisode, setScoringEpisode] = useState(1)
  const [predictionEpisode, setPredictionEpisode] = useState(1)
  const [predictionManager, setPredictionManager] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

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

  const onSetPrediction = (catId: ScoringCategoryId, targetPlayerId: number | null) => {
    if (!predictionManager) return
    service.setPrediction(predictionManager, predictionEpisode, catId, targetPlayerId); bump()
  }

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

        {activeTab === 'predictions' && (
          <PredictionsTab
            service={service}
            players={players}
            scoringCategories={cats}
            currentManager={predictionManager}
            managers={managers.map(m => m.name)}
            onChangeManager={setPredictionManager}
            episode={predictionEpisode}
            onEpisodeChange={setPredictionEpisode}
            onSetPrediction={onSetPrediction}
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
      />
    </div>
  )
}

export default App