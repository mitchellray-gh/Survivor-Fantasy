// Pure-function analytics helpers derived from the PlayerService state.
//
// Everything here is a small heuristic based on the events + overrides
// already stored in the DB - no ML, no server calls. Each function takes
// the service as its only dependency so it stays trivial to test.

import type { PlayerService, Player } from './playerService'

export interface EpisodeSeries {
  /** Ordered ep numbers we have data for (1..maxEpisode). */
  episodes: number[]
  /** Points earned in each of the above episodes (parallel array). */
  values: number[]
}

/**
 * Find the highest episode number we have any data (events OR overrides) for
 * in the entire league. Used to define "the current episode" for delta calcs
 * without needing a meta field.
 */
export function getMaxEpisode(service: PlayerService): number {
  const players = service.getPlayers()
  let max = 0
  for (const p of players) {
    for (const cat of service.getScoringCategories()) {
      for (let ep = 1; ep <= 30; ep++) {
        if (service.getEventValue(p.id, ep, cat.id) > 0) {
          if (ep > max) max = ep
        }
      }
    }
    // Also account for episodes with only overrides
    for (let ep = 1; ep <= 30; ep++) {
      if (service.getOverride(p.id, ep) !== 0 && ep > max) max = ep
    }
  }
  return max
}

/** Points a manager earned in one specific episode. */
export function managerEpisodeTotal(service: PlayerService, managerName: string, episode: number): number {
  const players = service.getPlayers().filter(p => p.managerName === managerName)
  return players.reduce((sum, p) => sum + service.getPlayerEpisodeTotal(p.id, episode), 0)
}

/** Full per-episode point history for a manager. */
export function managerEpisodeSeries(service: PlayerService, managerName: string, maxEpisode: number): EpisodeSeries {
  const episodes: number[] = []
  const values: number[] = []
  for (let ep = 1; ep <= Math.max(1, maxEpisode); ep++) {
    episodes.push(ep)
    values.push(managerEpisodeTotal(service, managerName, ep))
  }
  return { episodes, values }
}

/**
 * "Hotness" score in [-1, 1]: how a player's most recent episode compares
 * to their prior-episode average. Positive = trending up.
 * Returns 0 if there's not enough data.
 */
export function playerTrend(service: PlayerService, playerId: number, maxEpisode: number): number {
  if (maxEpisode < 2) return 0
  const recent = service.getPlayerEpisodeTotal(playerId, maxEpisode)
  let prior = 0, priorCount = 0
  for (let ep = 1; ep < maxEpisode; ep++) {
    prior += service.getPlayerEpisodeTotal(playerId, ep)
    priorCount++
  }
  if (priorCount === 0) return 0
  const priorAvg = prior / priorCount
  const diff = recent - priorAvg
  // Normalise by ~10 pts. A +10 point swing = full "hot".
  const clamped = Math.max(-1, Math.min(1, diff / 10))
  return clamped
}

export type Hotness = 'hot' | 'cold' | 'risk' | null

/**
 * Simple label for a player based on trend + status. Boot-risk kicks in when
 * a player has *low* recent scoring AND is still alive - i.e. producing
 * nothing for their manager and probably a target.
 */
export function playerHotness(service: PlayerService, player: Player, maxEpisode: number): Hotness {
  if (player.status === 'voted_out' || player.status === 'medevac' || player.status === 'quit') return null
  const trend = playerTrend(service, player.id, maxEpisode)
  if (trend >= 0.4) return 'hot'
  if (trend <= -0.3) return 'cold'
  // Boot risk: alive but silent for the most recent episode.
  if (maxEpisode >= 2 && service.getPlayerEpisodeTotal(player.id, maxEpisode) <= 0) return 'risk'
  return null
}

/** Manager delta = last episode vs prior-episode average. */
export interface ManagerDelta {
  name: string
  total: number
  lastEpisode: number
  priorAverage: number
  delta: number  // lastEpisode - priorAverage, rounded
}
export function managerDeltas(service: PlayerService, maxEpisode: number): ManagerDelta[] {
  return service.getManagers().map(m => {
    const total = service.getManagerTotal(m.name)
    const last = maxEpisode > 0 ? managerEpisodeTotal(service, m.name, maxEpisode) : 0
    let prior = 0, count = 0
    for (let ep = 1; ep < maxEpisode; ep++) {
      prior += managerEpisodeTotal(service, m.name, ep)
      count++
    }
    const avg = count > 0 ? prior / count : 0
    return {
      name: m.name,
      total,
      lastEpisode: last,
      priorAverage: Math.round(avg * 10) / 10,
      delta: Math.round(last - avg),
    }
  })
}

/** Best individual scorer among all castaways (highest total). */
export function topScorer(service: PlayerService): { player: Player | null; total: number } {
  const players = service.getPlayers()
  let best: Player | null = null
  let bestTotal = -Infinity
  for (const p of players) {
    const total = service.getPlayerTotal(p.id)
    if (total > bestTotal) { bestTotal = total; best = p }
  }
  return { player: best, total: best ? bestTotal : 0 }
}

/** Best pick for each manager - the highest-scoring player on their roster. */
export function bestPickPerManager(service: PlayerService): { manager: string; player: Player | null; total: number }[] {
  return service.getManagers().map(m => {
    let best: Player | null = null
    let bestTotal = -Infinity
    for (const p of m.players) {
      const total = service.getPlayerTotal(p.id)
      if (total > bestTotal) { bestTotal = total; best = p }
    }
    return { manager: m.name, player: best, total: best ? bestTotal : 0 }
  })
}
