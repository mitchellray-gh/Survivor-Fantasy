import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import PlayerCard from './components/PlayerCard'
import ScoringTab from './components/ScoringTab'
import { PlayerService, type ScoringCategoryId } from './data/playerService'
import './App.css'

type TabId = 'dashboard' | 'players' | 'teams' | 'scoring'
const GROUPS = ['Survival','Challenge','Advantage','Social & Drama'] as const

function App() {
  const [service] = useState(() => new PlayerService())
  const [version, setVersion] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const bump = () => setVersion(v => v + 1)

  // Load persisted state (localStorage or /api/league) once on mount.
  useEffect(() => {
    let cancelled = false
    void service.hydrate().finally(() => { if (!cancelled) { setHydrated(true); bump() } })
    return () => { cancelled = true }
  }, [service])
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [scoringEpisode, setScoringEpisode] = useState(1)

  const players = service.getPlayers()
  const managers = service.getManagers()
  const cats = service.getScoringCategories()

  const onVoteOut = (id: number) => { service.voteOutPlayer(id); bump() }
  const onUnvoteOut = (id: number) => { service.unvoteOutPlayer(id); bump() }
  const onToggleEvent = (playerId: number, catId: ScoringCategoryId) => {
    service.toggleEvent(playerId, scoringEpisode, catId); bump()
  }

  const standings = useMemo(() => {
    void version
    return managers.map(m => ({
      name: m.name, players: m.players,
      total: service.getManagerTotal(m.name),
      remaining: m.players.filter(p => !p.votedOut).length,
    })).sort((a, b) => b.total - a.total || b.remaining - a.remaining || a.name.localeCompare(b.name))
  }, [managers, service, version])

  return (
    <div className="app">
      <Header title={'Survivor Fantasy \u2014 Season 51'} />
      <main className="main-content">
        <div className="content-wrapper">
          <div className="tabs">
            <button className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
            <button className={`tab-button ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>Players ({players.length})</button>
            <button className={`tab-button ${activeTab === 'teams' ? 'active' : ''}`} onClick={() => setActiveTab('teams')}>Teams ({managers.length})</button>
            <button className={`tab-button ${activeTab === 'scoring' ? 'active' : ''}`} onClick={() => setActiveTab('scoring')}>Scoring</button>
            <span className={`storage-badge ${service.isRemote() ? 'remote' : 'local'}`} title={service.isRemote() ? 'Shared league database' : 'Local to this browser only'}>
              {!hydrated ? 'Loading\u2026' : service.isRemote() ? 'Shared \u2022 synced' : 'Local only'}
            </span>
          </div>

          {activeTab === 'dashboard' && (
            <div className="dashboard-content">
              <h2>League Standings</h2>
              <p>Season 51 premieres Wednesday, Sept. 23, 2026 on CBS &amp; Paramount+.</p>
              <table className="standings-table">
                <thead><tr><th>#</th><th>Manager</th><th>Roster</th><th>Alive</th><th>Points</th></tr></thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.name}><td>{i + 1}</td><td><strong>{s.name}</strong></td><td>{s.players.length}</td><td>{s.remaining}</td><td className="pts">{s.total}</td></tr>
                  ))}
                </tbody>
              </table>
              <h3 style={{marginTop: '2rem'}}>Scoring System</h3>
              <div className="rules-grid">
                {GROUPS.map(group => (
                  <div key={group} className="rule-group">
                    <h4>{group}</h4>
                    <ul>
                      {cats.filter(c => c.group === group).map(c => (
                        <li key={c.id}>
                          <span className={`pts-badge ${c.points >= 0 ? 'pos' : 'neg'}`}>{c.points >= 0 ? '+' : ''}{c.points}</span>
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'players' && (
            <div className="players-content">
              <h2>All Castaways ({players.length})</h2>
              <div className="players-grid">
                {players.map(p => (
                  <PlayerCard key={p.id} player={p} managerLabel={p.managerName} totalPoints={service.getPlayerTotal(p.id)} onVoteOut={onVoteOut} onUnvoteOut={onUnvoteOut} showVoteControls />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'teams' && (
            <div className="teams-content">
              <h2>Team Rosters</h2>
              {managers.map(m => (
                <section key={m.name} className="team-section">
                  <div className="team-header">
                    <h3>{m.name}</h3>
                    <span className="team-meta">{m.players.length} drafted &middot; {m.players.filter(p => !p.votedOut).length} alive &middot; <strong>{service.getManagerTotal(m.name)} pts</strong></span>
                  </div>
                  <div className="players-grid">
                    {m.players.map(p => (
                      <PlayerCard key={p.id} player={p} managerLabel={m.name} totalPoints={service.getPlayerTotal(p.id)} onVoteOut={onVoteOut} onUnvoteOut={onUnvoteOut} showVoteControls />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {activeTab === 'scoring' && (
            <ScoringTab service={service} players={players} scoringCategories={cats} episode={scoringEpisode} onEpisodeChange={setScoringEpisode} onToggleEvent={onToggleEvent} />
          )}
        </div>
      </main>
    </div>
  )
}

export default App