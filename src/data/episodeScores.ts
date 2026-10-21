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
// Model: the season is described in show terms and everything else is
// derived from it:
//
//   SEASON_EXITS   - who left the game, in which episode, and how. Drives
//                    survival eligibility, the -10 quitting penalty, and the
//                    player's status (voted_out / quit) on the cast list.
//   SEED_EPISODES  - per-episode results (challenge winner, idol find, ...).
//
// Survival: +2 goes to every castaway still in the game, i.e. anyone with an
// exit in this or any earlier episode earns nothing. That matches how Survivor
// actually scores - once you're booted you stop earning.
//
// WHEN YOU EDIT THIS FILE, bump SEED_VERSION. Stores seeded at an older
// version re-assert the seed once (stale cells cleared, statuses applied only
// to players still marked active), then go back to leaving manual edits
// alone. New episodes added at the current version seed as fill-gaps, as
// before.

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

/**
 * Who has left the game this season, in boot order. Single source of truth
 * for survival eligibility, the quitting penalty, AND player status:
 *   - an exit at episode <= E removes that player from episode E's survival
 *   - kind seeds status: voted_out -> 'voted_out', quit -> 'quit'
 *   - a quit also books the rules' -10 quitting penalty in its episode
 */
export interface SeasonExit {
  playerId: number
  /** Episode the exit happened in. Aaliyah's premiere boot is episode 1;
   *  no scoring is seeded for the premiere (we were never given it). */
  episode: number
  kind: 'voted_out' | 'quit'
}

export const SEASON_EXITS: SeasonExit[] = [
  { playerId: 1,  episode: 1, kind: 'voted_out' }, // Aaliyah Puglia - 1st out (Day 3, premiere)
  { playerId: 4,  episode: 2, kind: 'voted_out' }, // Ana Sani - 2nd out (Day 5)
  { playerId: 20, episode: 3, kind: 'quit' },      // Rob Antonson - left the game (Day 6, foot infection)
  { playerId: 19, episode: 3, kind: 'voted_out' }, // Patt Cannaday - 3rd out (Day 7, "Five" blindside)
  { playerId: 12, episode: 4, kind: 'voted_out' }, // Jenna Doore - 4th out / 5th overall to leave (Ep 4, "That's the Magic of Survivor")
]

/** One aired episode, described in show terms. Survival is derived, not listed. */
export interface SeedEpisode {
  episode: number
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
    // Episode 2: Ana voted out in a 6-4 blindside (see SEASON_EXITS); Toka won
    // the whale immunity challenge; Jelly found an idol at the Toka camp.
    episode: 2,
    challengeWinners: [6, 10, 5, 12, 9, 14, 16, 17, 19], // Toka tribe
    idolFinder: 5,  // Angelica "Jelly" Loblack
    firstToCry: null,
    bleeped: [],
  },
  {
    // Episode 3: Rob quit and Patt was blindsided (see SEASON_EXITS); Savu won
    // the muddy obstacle-course immunity challenge; Kristin found an advantage
    // in the water well; Jenna cried first; Devin got bleeped after dropping
    // the puzzle pieces. Mike was NOT voted out - he survives this episode.
    episode: 3,
    challengeWinners: [2, 7, 8, 11, 13, 15, 18, 20, 21], // Savu tribe
    idolFinder: 13, // Kristin Flickinger
    firstToCry: 12, // Jenna Doore
    bleeped: [10],  // Devin Way
  },
  {
    // Episode 4: tribe swap into Savu / Toka / Dina; Jenna voted out 4-1 at
    // Savu's Tribal Council (see SEASON_EXITS). Dina won immunity + coffee
    // reward - challenge winners are the post-swap Dina roster, which isn't
    // tracked in this repo yet (tribes.ts still holds the original savu/toka/
    // exile split). Fill in challengeWinners once the Dina roster is known.
    episode: 4,
    challengeWinners: [], // TODO: Dina tribe members post-swap - +2 each
    idolFinder: null,
    firstToCry: null,
    bleeped: [],
  },
]

/**
 * Version of the seed data. Bump whenever SEASON_EXITS or SEED_EPISODES
 * changes so stores seeded at an older version pick up the correction exactly
 * once (see applyEpisodeSeed / api/admin/init).
 */
export const SEED_VERSION = 3

/**
 * The league's current episode must never trail the seeded results: once
 * episode N's results are baked in, the league is at least on N+1 - the next
 * one to predict and score. A higher number the commissioner set is kept.
 */
export function suggestedCurrentEpisode(stored: number): number {
  const maxSeeded = Math.max(...SEED_EPISODES.map(e => e.episode))
  return Math.max(stored, maxSeeded + 1)
}

/** meta key marking that an episode's seed has been applied to a backend.
 *  The value is the SEED_VERSION that was applied, not just '1'. */
export function seedFlagKey(episode: number): string {
  return `seed_ep${episode}_applied`
}

/**
 * Derive the flat event list from SEASON_EXITS + SEED_EPISODES. Walks
 * episodes in order and treats anyone with an exit at or before the episode
 * as out of the game, so survival +2 only lands on players still in it at
 * that point in the season. Quits book the -10 quitting penalty in their
 * episode; voted-out castaways have no automatic penalty category.
 */
function buildSeedEvents(): SeedEvent[] {
  const events: SeedEvent[] = []

  for (const ep of [...SEED_EPISODES].sort((a, b) => a.episode - b.episode)) {
    const outSoFar = new Set(
      SEASON_EXITS.filter(x => x.episode <= ep.episode).map(x => x.playerId),
    )

    // Survival +2 for everyone still in the game.
    for (const p of PLAYERS) {
      if (outSoFar.has(p.id)) continue
      events.push({ playerId: p.id, episode: ep.episode, categoryId: 'survived_tribal', count: 1 })
    }

    // Quitting the game (-10) for anyone whose exit lands this episode.
    for (const x of SEASON_EXITS) {
      if (x.episode === ep.episode && x.kind === 'quit') {
        events.push({ playerId: x.playerId, episode: ep.episode, categoryId: 'quit', count: 1 })
      }
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

/**
 * Final status for every castaway who has left the game, keyed by player id.
 * Applied by the seed ONCE (and only to players still marked 'active'), so
 * from then on the admin drawer owns status as usual.
 */
export function seedStatuses(): Map<number, 'voted_out' | 'quit'> {
  const out = new Map<number, 'voted_out' | 'quit'>()
  // Sorted by episode so the latest exit wins if a player ever appears twice.
  for (const x of [...SEASON_EXITS].sort((a, b) => a.episode - b.episode)) {
    out.set(x.playerId, x.kind)
  }
  return out
}

