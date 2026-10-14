// Historical episode scoring, seeded into the league so the standings, cast
// list, and recap reflect what actually happened on the show.
//
// This is REFERENCE data in the same spirit as players.ts / scoringRules.ts /
// tribes.ts: it describes episodes that already aired. It is applied once per
// episode into each backend's mutable state (localStorage on first local run,
// the episode_events table via POST /api/admin/init) and from then on behaves
// exactly like scores a commissioner entered by hand - toggling one off and
// deleting it both persist normally.
//
// Model: each aired episode is described declaratively below (who was voted
// out, who won the challenge, etc.) and SEED_EVENTS is DERIVED from that. The
// one computed rule is survival: +2 goes to every castaway still in the game,
// i.e. anyone voted out in this or any earlier episode earns nothing. That
// matches how Survivor actually scores - once you're booted you stop earning.

import { PLAYERS } from './players.js'
import type { ScoringCategoryId } from './scoringRules.js'

/** Same shape as StateEvent, declared locally so this module stays free of any
 *  browser-only imports (storage.ts) and can be pulled into the server build. */
export interface SeedEvent {
  playerId: number
  episode: number
  categoryId: ScoringCategoryId
  count: number
}

/** One aired episode, described in show terms. Survival is derived, not listed. */
export interface SeedEpisode {
  episode: number
  /** Castaway(s) voted out at THIS episode's Tribal (by player id). They earn
   *  no survival point this episode and are excluded from every later one. */
  votedOut: number[]
  /** Winners of the tribal/team immunity challenge (+2 each). */
  challengeWinners: number[]
  /** Whoever found a hidden idol/advantage this episode (+4), or null. */
  idolFinder: number | null
  /** First person to cry this episode (+2), or null. */
  firstToCry: number | null
  /** Castaway(s) bleeped for swearing (+1 each). */
  bleeped: number[]
}

export const SEED_EPISODES: SeedEpisode[] = [
  {
    // Episode 2: Ana voted out in a 6-4 blindside; Toka won the whale immunity
    // challenge; Jelly found an idol at the Toka camp.
    episode: 2,
    votedOut: [4], // Ana Sani
    challengeWinners: [6, 10, 5, 12, 9, 14, 16, 17, 19], // Toka tribe
    idolFinder: 5,  // Angelica "Jelly" Loblack
    firstToCry: null,
    bleeped: [],
  },
  {
    // Episode 3: Mike voted out; Savu won the muddy obstacle-course immunity
    // challenge; Kristin found an advantage in the water well; Jenna cried
    // first; Devin got bleeped after dropping the puzzle pieces.
    episode: 3,
    votedOut: [17], // Mike Pinsky
    challengeWinners: [2, 7, 8, 11, 13, 15, 18, 20, 21], // Savu tribe
    idolFinder: 13, // Kristin Flickinger
    firstToCry: 12, // Jenna Doore
    bleeped: [10],  // Devin Way
  },
]

/** meta key marking that an episode's seed has been applied to a backend. */
export function seedFlagKey(episode: number): string {
  return `seed_ep${episode}_applied`
}

/**
 * Derive the flat event list from SEED_EPISODES. Walks episodes in order and
 * tracks the cumulative set of voted-out castaways so survival +2 only lands on
 * players still in the game at that point in the season.
 */
function buildSeedEvents(): SeedEvent[] {
  const events: SeedEvent[] = []
  const votedOutSoFar = new Set<number>()

  for (const ep of [...SEED_EPISODES].sort((a, b) => a.episode - b.episode)) {
    // Add this episode's boots BEFORE computing survival: someone voted out
    // this episode did not survive this episode's Tribal.
    for (const id of ep.votedOut) votedOutSoFar.add(id)

    // Survival +2 for everyone still in the game.
    for (const p of PLAYERS) {
      if (votedOutSoFar.has(p.id)) continue
      events.push({ playerId: p.id, episode: ep.episode, categoryId: 'survived_tribal', count: 1 })
    }

    // Challenge +2 for the winning tribe.
    for (const playerId of ep.challengeWinners) {
      events.push({ playerId, episode: ep.episode, categoryId: 'tribal_challenge_win', count: 1 })
    }

    // Advantage +4 for the idol/advantage find.
    if (ep.idolFinder != null) {
      events.push({ playerId: ep.idolFinder, episode: ep.episode, categoryId: 'found_idol_or_advantage', count: 1 })
    }

    // Social & Drama: first to cry (+2) and bleeped for swearing (+1 each).
    if (ep.firstToCry != null) {
      events.push({ playerId: ep.firstToCry, episode: ep.episode, categoryId: 'first_to_cry', count: 1 })
    }
    for (const playerId of ep.bleeped) {
      events.push({ playerId, episode: ep.episode, categoryId: 'bleeped_swearing', count: 1 })
    }
  }

  return events
}

export const SEED_EVENTS: SeedEvent[] = buildSeedEvents()

