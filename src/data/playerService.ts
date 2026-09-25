import { PLAYERS, type Player } from './players'
import {
  SCORING_CATEGORIES,
  totalPointsForEvents,
  type EpisodeScore,
  type ScoringCategory,
  type ScoringCategoryId,
} from './scoringRules'

export type { Player, EpisodeScore, ScoringCategory, ScoringCategoryId }

export interface Manager {
  name: string
  players: Player[]
}

const STORAGE_KEY = 'survivor_fantasy_state_v1'

interface PersistedState {
  votedOut: number[]
  scores: EpisodeScore[]
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { votedOut: [], scores: [] }
    const parsed = JSON.parse(raw) as PersistedState
    return {
      votedOut: Array.isArray(parsed.votedOut) ? parsed.votedOut : [],
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
    }
  } catch {
    return { votedOut: [], scores: [] }
  }
}

function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * PlayerService is the single source of truth in the app. It hydrates the
 * static roster from players.ts, applies persisted vote-out / scoring state
 * from localStorage, and exposes helpers for the UI.
 */
export class PlayerService {
  private players: Player[]
  private scores: EpisodeScore[]

  constructor() {
    const persisted = loadState()
    // Clone so we do not mutate the frozen import.
    this.players = PLAYERS.map(p => ({ ...p, votedOut: persisted.votedOut.includes(p.id) }))
    this.scores = persisted.scores
  }

  private persist(): void {
    saveState({
      votedOut: this.players.filter(p => p.votedOut).map(p => p.id),
      scores: this.scores,
    })
  }

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
