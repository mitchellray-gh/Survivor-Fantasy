// Encodes the exact Survivor Fantasy League scoring system from leaguerules.txt.
// If a rule is toggled per-player-per-episode, use the isBoolean rules; if it
// is a count (e.g., "sat out 2 challenges"), use isCount rules.

export type ScoringCategoryId =
  | 'survived_tribal'
  | 'made_merge'
  | 'made_final_three'
  | 'sole_survivor'
  | 'individual_immunity'
  | 'individual_reward'
  | 'tribal_challenge_win'
  | 'sat_out_challenge'
  | 'found_idol_or_advantage'
  | 'played_idol_successfully'
  | 'played_shot_in_dark'
  | 'voted_out_with_idol'
  | 'first_to_cry'
  | 'bleeped_swearing'
  | 'medical_evac'
  | 'quit'

export interface ScoringCategory {
  id: ScoringCategoryId
  group: 'Survival' | 'Challenge' | 'Advantage' | 'Social & Drama'
  label: string
  points: number
}

export const SCORING_CATEGORIES: ScoringCategory[] = [
  // Survival
  { id: 'survived_tribal',         group: 'Survival',       label: 'Surviving the weekly Tribal Council', points:  2 },
  { id: 'made_merge',              group: 'Survival',       label: 'Making the Merge',                    points:  5 },
  { id: 'made_final_three',        group: 'Survival',       label: 'Making the Final Three',              points: 10 },
  { id: 'sole_survivor',           group: 'Survival',       label: 'Winning Sole Survivor',               points: 20 },
  // Challenge
  { id: 'individual_immunity',     group: 'Challenge',      label: 'Winning Individual Immunity',         points:  5 },
  { id: 'individual_reward',       group: 'Challenge',      label: 'Winning Individual Reward',           points:  3 },
  { id: 'tribal_challenge_win',    group: 'Challenge',      label: 'Winning a Tribal/Team Challenge',     points:  2 },
  { id: 'sat_out_challenge',       group: 'Challenge',      label: 'Sitting out of a challenge',          points: -1 },
  // Advantage
  { id: 'found_idol_or_advantage', group: 'Advantage',      label: 'Finding a Hidden Immunity Idol or Advantage', points:  4 },
  { id: 'played_idol_successfully',group: 'Advantage',      label: 'Successfully playing an Idol (negates votes)', points:  5 },
  { id: 'played_shot_in_dark',     group: 'Advantage',      label: 'Correctly playing a Shot in the Dark', points:  5 },
  { id: 'voted_out_with_idol',     group: 'Advantage',      label: 'Voted out with an Idol in their pocket', points: -5 },
  // Social & Drama
  { id: 'first_to_cry',            group: 'Social & Drama', label: 'First person to cry in an episode',   points:  2 },
  { id: 'bleeped_swearing',        group: 'Social & Drama', label: 'Getting bleeped for swearing',        points:  1 },
  { id: 'medical_evac',            group: 'Social & Drama', label: 'Medical Evacuation',                  points: -3 },
  { id: 'quit',                    group: 'Social & Drama', label: 'Quitting the game',                   points: -10 },
]

export interface EpisodeScore {
  playerId: number
  episode: number
  events: Partial<Record<ScoringCategoryId, number>> // count per category (0/1 for booleans)
}

export function totalPointsForEvents(events: Partial<Record<ScoringCategoryId, number>>): number {
  let total = 0
  for (const cat of SCORING_CATEGORIES) {
    const count = events[cat.id] ?? 0
    total += count * cat.points
  }
  return total
}
