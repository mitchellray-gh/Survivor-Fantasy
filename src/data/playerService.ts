import { PLAYERS, type Player } from './players'
import {
  SCORING_CATEGORIES,
  totalPointsForEvents,
  type EpisodeScore,
  type ScoringCategory,
  type ScoringCategoryId,
} from './scoringRules'
import {
  createBackend,
  EMPTY_STATE,
  StorageConflictError,
  type LeagueState,
  type StorageBackend,
} from './storage'

export type { Player, EpisodeScore, ScoringCategory, ScoringCategoryId }
export { StorageConflictError }

export interface Manager {
  name: string
  players: Player[]
}

/**
 * PlayerService is the single source of truth in the app. It hydrates the
 * static roster from players.ts and applies mutable vote-out / scoring
 * state loaded through a StorageBackend (localStorage or /api/league).
 *
 * All mutations are optimistic locally; a debounced commit() persists to
 * the backend and re-syncs the local `version` on success.
 */
export class PlayerService {
  private players: Player[]
  private scores: EpisodeScore[]
  private version = 0
  private commitTimer: ReturnType<typeof setTimeout> | null = null
  private commitPromise: Promise<void> | null = null

  constructor(private readonly backend: StorageBackend = createBackend()) {
    // Start with an empty state; UI should call hydrate() before rendering.
    this.players = PLAYERS.map(p => ({ ...p, votedOut: false }))
    this.scores = []
  }

  /** Load persisted state from the backend and merge it into the roster. */
  async hydrate(): Promise<void> {
    let state: LeagueState
    try { state = await this.backend.load() }
    catch { state = { ...EMPTY_STATE } }
    this.applyState(state)
  }

  private applyState(state: LeagueState): void {
    const votedSet = new Set(state.votedOut)
    for (const p of this.players) p.votedOut = votedSet.has(p.id)
    this.scores = state.scores as EpisodeScore[]
    this.version = state.version
  }

  private snapshot(): LeagueState {
    return {
      votedOut: this.players.filter(p => p.votedOut).map(p => p.id),
      scores: this.scores,
      version: this.version,
    }
  }

  /**
   * Queue a commit to the backend. Multiple rapid mutations coalesce into
   * one write so a user clicking 5 checkboxes in a row only triggers one
   * network round-trip.
   */
  private persist(): void {
    if (this.commitTimer) clearTimeout(this.commitTimer)
    this.commitTimer = setTimeout(() => { void this.commit() }, 250)
  }

  /** Flush any pending writes immediately. Safe to call multiple times. */
  async commit(): Promise<void> {
    if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null }
    if (this.commitPromise) return this.commitPromise
    this.commitPromise = (async () => {
      try {
        const next = await this.backend.save(this.snapshot())
        this.version = next.version
      } catch (err) {
        if (err instanceof StorageConflictError) {
          // Someone else wrote first. Reload their state (we lose our
          // pending change; the UI can prompt the user to redo it).
          await this.hydrate()
        } else {
          console.error('[PlayerService] commit failed:', err)
        }
      } finally {
        this.commitPromise = null
      }
    })()
    return this.commitPromise
  }

  /** True when the app is talking to a shared server, false for local-only. */
  isRemote(): boolean { return this.backend.kind === 'remote' }

  getPlayers(): Player[] {
    return this.players
  }

  getPlayerById(id: number): Player | undefined {
    return this.players.find(p => p.id === id)
  }

  voteOutPlayer(playerId: number): void {
    const p = this.getPlayerById(playerId)
    if (p) { p.votedOut = true; this.persist() }
  }

  unvoteOutPlayer(playerId: number): void {
    const p = this.getPlayerById(playerId)
    if (p) { p.votedOut = false; this.persist() }
  }

  getManagers(): Manager[] {
    const byName = new Map<string, Player[]>()
    for (const p of this.players) {
      if (!byName.has(p.managerName)) byName.set(p.managerName, [])
      byName.get(p.managerName)!.push(p)
    }
    return Array.from(byName.entries())
      .map(([name, players]) => ({ name, players }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getScoringCategories(): ScoringCategory[] {
    return SCORING_CATEGORIES
  }

  /** Sum of all points a single player has earned across every logged episode. */
  getPlayerTotal(playerId: number): number {
    return this.scores
      .filter(s => s.playerId === playerId)
      .reduce((sum, s) => sum + totalPointsForEvents(s.events), 0)
  }

  /** Sum across an entire manager's roster. */
  getManagerTotal(managerName: string): number {
    return this.players
      .filter(p => p.managerName === managerName)
      .reduce((sum, p) => sum + this.getPlayerTotal(p.id), 0)
  }

  /** Toggle a boolean scoring event for a player in a given episode. */
  toggleEvent(playerId: number, episode: number, categoryId: ScoringCategoryId): void {
    let entry = this.scores.find(s => s.playerId === playerId && s.episode === episode)
    if (!entry) {
      entry = { playerId, episode, events: {} }
      this.scores.push(entry)
    }
    entry.events[categoryId] = entry.events[categoryId] ? 0 : 1
    this.persist()
  }

  getEventValue(playerId: number, episode: number, categoryId: ScoringCategoryId): number {
    const entry = this.scores.find(s => s.playerId === playerId && s.episode === episode)
    return entry?.events[categoryId] ?? 0
  }
}
