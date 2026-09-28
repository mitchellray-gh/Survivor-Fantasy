import { PLAYERS, type Player } from './players'
import {
  SCORING_CATEGORIES,
  type ScoringCategory,
  type ScoringCategoryId,
} from './scoringRules'
import {
  createBackend,
  type PlayerStatus,
  type StateEvent,
  type StateOverride,
  type StatePrediction,
  type StorageBackend,
} from './storage'

export type { Player, ScoringCategory, ScoringCategoryId, PlayerStatus }

export interface Manager {
  name: string
  players: Player[]
}

/**
 * PlayerService is the single source of truth for the UI. It merges:
 *
 *   1. Static roster from src/data/players.ts (name, photo, occupation, ...)
 *   2. Mutable state from the backend (status, events, overrides, predictions,
 *      and optional server-side manager reassignments).
 *
 * All mutations are optimistic: we update the in-memory copy synchronously so
 * the UI re-renders immediately, then fire an async POST. Failures are logged
 * (last-write-wins - no more version conflicts, no more rollbacks).
 */
export class PlayerService {
  private players: Player[]
  private events: StateEvent[] = []
  private overrides: StateOverride[] = []
  private predictions: StatePrediction[] = []
  private meta: Record<string, string> = {}

  constructor(private readonly backend: StorageBackend = createBackend()) {
    // Deep-copy the static roster; votedOut kept as a convenience field the
    // rest of the app already reads.
    this.players = PLAYERS.map(p => ({ ...p, votedOut: false }))
  }

  /** Load persisted state and merge it onto the static roster. */
  async hydrate(): Promise<void> {
    try {
      const snap = await this.backend.load()

      if (snap.players.length > 0) {
        // Server players (if present) win over static fields, so an admin can
        // rename or reassign someone through the API and see it reflected.
        const byId = new Map(snap.players.map(p => [p.id, p]))
        this.players = PLAYERS.map(base => {
          const remote = byId.get(base.id)
          if (!remote) return { ...base, votedOut: false }
          return {
            ...base,
            name:        remote.name        || base.name,
            age:         remote.age        ?? base.age,
            hometown:    remote.hometown   ?? base.hometown,
            residence:   remote.residence  ?? base.residence,
            occupation:  remote.occupation ?? base.occupation,
            aboutMe:     remote.aboutMe    ?? base.aboutMe,
            photo:       remote.photo      ?? base.photo,
            managerName: remote.managerName ?? base.managerName,
            status:      remote.status,
            votedOut:    remote.status !== 'active' && remote.status !== 'winner',
          }
        })
      } else {
        // Local-only: apply status overlay from placeholder rows the local
        // backend wrote (if any).
        const byId = new Map(snap.players.map(p => [p.id, p]))
        for (const p of this.players) {
          const overlay = byId.get(p.id)
          const status: PlayerStatus = overlay?.status ?? 'active'
          p.status = status
          p.votedOut = status !== 'active' && status !== 'winner'
          if (overlay?.managerName != null) p.managerName = overlay.managerName
        }
      }

      this.events      = snap.events
      this.overrides   = snap.overrides
      this.predictions = snap.predictions
      this.meta        = snap.meta
    } catch (err) {
      console.error('[PlayerService] hydrate failed:', err)
    }
  }

  /** True when the app is talking to a shared server, false for local-only. */
  isRemote(): boolean { return this.backend.kind === 'remote' }

  // -------- Roster / manager queries -----------------------------------------

  getPlayers(): Player[] { return this.players }
  getPlayerById(id: number): Player | undefined { return this.players.find(p => p.id === id) }

  getManagers(): Manager[] {
    const byName = new Map<string, Player[]>()
    for (const p of this.players) {
      if (!p.managerName) continue
      if (!byName.has(p.managerName)) byName.set(p.managerName, [])
      byName.get(p.managerName)!.push(p)
    }
    return Array.from(byName.entries())
      .map(([name, players]) => ({ name, players }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getScoringCategories(): ScoringCategory[] { return SCORING_CATEGORIES }
  getMeta(key: string): string | undefined { return this.meta[key] }

  // -------- Points math ------------------------------------------------------

  /** Points for one player in one episode: sum of (event.count * category.points) + override. */
  getPlayerEpisodeTotal(playerId: number, episode: number): number {
    let total = 0
    for (const cat of SCORING_CATEGORIES) {
      total += this.getEventValue(playerId, episode, cat.id) * cat.points
    }
    total += this.getOverride(playerId, episode)
    return total
  }

  /** Sum of a player's points across every episode we have data for. */
  getPlayerTotal(playerId: number): number {
    const episodes = new Set<number>()
    for (const e of this.events)    if (e.playerId === playerId) episodes.add(e.episode)
    for (const o of this.overrides) if (o.playerId === playerId) episodes.add(o.episode)
    let total = 0
    for (const ep of episodes) total += this.getPlayerEpisodeTotal(playerId, ep)
    return total
  }

  /** Sum across an entire manager's roster. */
  getManagerTotal(managerName: string): number {
    return this.players
      .filter(p => p.managerName === managerName)
      .reduce((sum, p) => sum + this.getPlayerTotal(p.id), 0)
  }

  // -------- Events (per-episode scoring) -------------------------------------

  getEventValue(playerId: number, episode: number, categoryId: ScoringCategoryId): number {
    const row = this.events.find(e =>
      e.playerId === playerId && e.episode === episode && e.categoryId === categoryId
    )
    return row?.count ?? 0
  }

  setEventCount(playerId: number, episode: number, categoryId: ScoringCategoryId, count: number): void {
    const clamped = Math.max(0, Math.floor(count))
    this.events = this.events.filter(e =>
      !(e.playerId === playerId && e.episode === episode && e.categoryId === categoryId)
    )
    if (clamped > 0) this.events.push({ playerId, episode, categoryId, count: clamped })
    void this.backend.setEvent({ playerId, episode, categoryId, count: clamped })
      .catch(err => console.error('[PlayerService] setEvent failed:', err))
  }

  /** Convenience: booleans still use 0/1. */
  toggleEvent(playerId: number, episode: number, categoryId: ScoringCategoryId): void {
    const cur = this.getEventValue(playerId, episode, categoryId)
    this.setEventCount(playerId, episode, categoryId, cur > 0 ? 0 : 1)
  }

  // -------- Player status ----------------------------------------------------

  setPlayerStatus(playerId: number, status: PlayerStatus): void {
    const p = this.getPlayerById(playerId)
    if (!p) return
    p.status = status
    p.votedOut = status !== 'active' && status !== 'winner'
    void this.backend.setPlayerStatus(playerId, status)
      .catch(err => console.error('[PlayerService] setPlayerStatus failed:', err))
  }

  /** Back-compat helpers used by existing screens. */
  voteOutPlayer(playerId: number):   void { this.setPlayerStatus(playerId, 'voted_out') }
  unvoteOutPlayer(playerId: number): void { this.setPlayerStatus(playerId, 'active') }

  setPlayerManager(playerId: number, managerName: string | null): void {
    const p = this.getPlayerById(playerId)
    if (!p) return
    p.managerName = managerName ?? ''
    void this.backend.setPlayerManager(playerId, managerName)
      .catch(err => console.error('[PlayerService] setPlayerManager failed:', err))
  }

  // -------- Commissioner overrides ------------------------------------------

  getOverride(playerId: number, episode: number): number {
    return this.overrides.find(o => o.playerId === playerId && o.episode === episode)?.delta ?? 0
  }

  setOverride(playerId: number, episode: number, delta: number, reason: string | null = null): void {
    this.overrides = this.overrides.filter(o => !(o.playerId === playerId && o.episode === episode))
    if (delta !== 0) this.overrides.push({ playerId, episode, delta, reason })
    void this.backend.setOverride({ playerId, episode, delta, reason })
      .catch(err => console.error('[PlayerService] setOverride failed:', err))
  }

  // -------- Predictions ------------------------------------------------------

  getPrediction(manager: string, episode: number, categoryId: ScoringCategoryId): number | null {
    return this.predictions.find(p =>
      p.manager === manager && p.episode === episode && p.categoryId === categoryId
    )?.targetPlayerId ?? null
  }

  setPrediction(manager: string, episode: number, categoryId: ScoringCategoryId, targetPlayerId: number | null): void {
    this.predictions = this.predictions.filter(p =>
      !(p.manager === manager && p.episode === episode && p.categoryId === categoryId)
    )
    if (targetPlayerId !== null) {
      this.predictions.push({ manager, episode, categoryId, targetPlayerId, locked: false })
    }
    void this.backend.setPrediction({ manager, episode, categoryId, targetPlayerId, locked: false })
      .catch(err => console.error('[PlayerService] setPrediction failed:', err))
  }
}

