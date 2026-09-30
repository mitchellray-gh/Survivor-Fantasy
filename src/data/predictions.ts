// The prediction market.
//
// Predictions are a SECONDARY game layered on top of the main league: managers
// spend a fixed weekly budget of "chips" on who will hit each event, and chips
// settle automatically once the commissioner scores the real episode. Chips
// never touch the main league scoreboard - they are tracked separately so a
// bad prediction week cannot wreck someone's actual standing.

import type { ScoringCategoryId } from './scoringRules.js'

/** Chips a manager may deploy per episode. */
export const WEEKLY_BUDGET = 100

/** Smallest wager the desk will accept. */
export const MIN_STAKE = 5

/** Largest single wager, so nobody can go all-in on one name. */
export const MAX_STAKE = 50

export interface Market {
  id: ScoringCategoryId
  /** The question, phrased like a market headline. */
  question: string
  /** Short ticker-style label. */
  ticker: string
  /** One-line explanation of how this settles. */
  howItSettles: string
  /** Real-money analogue, purely for flavour. */
  implied: string
}

/**
 * The five markets. Chosen because each is a single, checkable outcome that
 * the commissioner can score in the existing grid - no new scoring needed.
 */
export const MARKETS: Market[] = [
  {
    id: 'individual_immunity',
    ticker: 'IMM',
    question: 'Who takes Individual Immunity?',
    howItSettles: 'Correct if the scored winner is your pick.',
    implied: 'Physical read usually wins this one.',
  },
  {
    id: 'individual_reward',
    ticker: 'RWD',
    question: 'Who takes Individual Reward?',
    howItSettles: 'Correct if the scored winner is your pick.',
    implied: 'Smaller prize, same fight for it.',
  },
  {
    id: 'found_idol_or_advantage',
    ticker: 'IDL',
    question: 'Who finds an Idol or Advantage?',
    howItSettles: 'Correct if the finder is your pick.',
    implied: 'High variance. Often nobody finds one.',
  },
  {
    id: 'played_idol_successfully',
    ticker: 'PLAY',
    question: 'Who successfully plays an Idol?',
    howItSettles: 'Correct if the successful player is your pick.',
    implied: 'Rarest event on the board. Bet small.',
  },
  {
    id: 'first_to_cry',
    ticker: 'TEAR',
    question: 'Who is first to cry?',
    howItSettles: 'Correct if the first crier is your pick.',
    implied: 'Wild card. Nobody can model this.',
  },
]

/** Pay multiple: a correct pick on stake S returns S * multiplier in chips. */
export function payoutFor(marketId: ScoringCategoryId, stake: number): number {
  return Math.round(stake * multiplierFor(marketId))
}

/** How many chips a correct pick returns per chip staked. */
export function multiplierFor(marketId: ScoringCategoryId): number {
  switch (marketId) {
    case 'individual_immunity':      return 3
    case 'individual_reward':        return 4
    case 'found_idol_or_advantage':  return 5
    case 'played_idol_successfully': return 7
    case 'first_to_cry':             return 6
    default:                         return 3
  }
}

/** Risk band shown in the UI, derived from the multiplier. */
export function riskFor(marketId: ScoringCategoryId): 'Low' | 'Medium' | 'High' | 'Extreme' {
  const m = multiplierFor(marketId)
  if (m <= 3) return 'Low'
  if (m <= 4) return 'Medium'
  if (m <= 6) return 'High'
  return 'Extreme'
}
