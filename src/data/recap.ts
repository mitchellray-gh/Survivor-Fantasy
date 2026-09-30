// Weekly recap engine.
//
// Turns a scored episode into a readable news digest. Everything here is
// DERIVED from the same event rows the scoring grid writes, so the recap can
// never drift from the real scores - if the commissioner toggles a box, the
// story changes with it.
//
// Narrow misses (an idol that was never played, a "Not Safe") score nothing but
// still matter as news, so they are carried as free-text notes.

import type { ScoringCategory, ScoringCategoryId } from './scoringRules.js'

export interface RecapLine {
  categoryId: ScoringCategoryId
  categoryLabel: string
  group: string
  /** 'gain' scores points, 'miss' is a near-miss worth reporting. */
  kind: 'gain' | 'miss'
  points: number
  /** Players who scored it, or who blew the chance. */
  playerIds: number[]
  /** Short headline, e.g. "Rob finds a hidden immunity idol". */
  headline: string
}

/** Per-player movement for one episode. */
export interface PlayerMove {
  playerId: number
  delta: number
  /** Episodes where this player moved, oldest first. */
  history: Array<{ episode: number; delta: number }>
  seasonTotal: number
}

export interface Recap {
  episode: number
  lines: RecapLine[]
  /** Free-text notes the commissioner added for near-misses. */
  notes: string[]
  movers: PlayerMove[]
  top: PlayerMove[]
  totalAwarded: number
}

// News copy per category, written as headlines rather than rule labels.
//
// Each rule gets singular/plural phrasing so the verb agrees with how many
// castaways it actually fired for: "Rob finds" never becomes "Rob and Ana find"
// or "Eric are first to cry".
/** Suffix a verb for third person: singular when exactly one, else plural. */
const V = (n: number) => (n === 1 ? 's' : '')
type Copy = (n: number, names: string) => string

const HEADLINE: Partial<Record<ScoringCategoryId, Copy>> = {
  survived_tribal:          (n, s) => `${s} survive${V(n)} Tribal Council`,
  individual_immunity:      (n, s) => `${s} take${V(n)} Individual Immunity`,
  individual_reward:        (n, s) => `${s} take${V(n)} Individual Reward`,
  tribal_challenge_win:     (_n, s) => `${s} win the challenge`,
  sat_out_challenge:        (n, s) => `${s} sit${V(n)} out of the challenge`,
  found_idol_or_advantage:  (n, s) => `${s} find${V(n)} an advantage`,
  played_idol_successfully: (n, s) => `${s} play${V(n)} the idol correctly`,
  played_shot_in_dark:      (n, s) => `${s} go${V(n)} safe on the shot in the dark`,
  voted_out_with_idol:      (n, s) => `${s} go${V(n)} out holding an idol`,
  first_to_cry:             (n, s) => `${s} ${n === 1 ? 'is' : 'are'} first to cry`,
  bleeped_swearing:         (n, s) => `${s} ${n === 1 ? 'gets' : 'get'} bleeped`,
  medical_evac:             (n, s) => `${s} ${n === 1 ? 'is' : 'are'} pulled by the doctor`,
  quit:                     (n, s) => `${s} quit${V(n)} the game`,
  made_merge:               (n, s) => `${s} make${V(n)} the merge`,
  made_final_three:         (n, s) => `${s} make${V(n)} the Final Three`,
  sole_survivor:            (n, s) => `${s} win${V(n)} the season`,
}

/** Turn a list of player ids into "Rob, Ana and Carter". */
export function joinNames(ids: number[], nameOf: (id: number) => string): string {
  if (ids.length === 0) return ''
  const names = ids.map(nameOf)
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Shorten a long list: "Rob, Ana and Carter, plus 17 more". Keeps the copy
 * readable while still crediting everyone on the row.
 */
function summarise(ids: number[], nameOf: (id: number) => string): string {
  if (ids.length <= 3) return joinNames(ids, nameOf)
  return `${joinNames(ids.slice(0, 3), nameOf)}, plus ${ids.length - 3} more`
}

/**
 * Build the digest for one episode.
 *
 * @param events       rows as { playerId, episode, categoryId, count }
 * @param categories   the scoring rule table, for labels and points
 * @param nameOf       id -> display name
 * @param seasonTotal  id -> season-to-date points
 * @param historyFor   id -> per-episode deltas across the season
 * @param notes        commissioner free text for the episode
 */
export function buildRecap(args: {
  episode: number
  events: Array<{ playerId: number; episode: number; categoryId: ScoringCategoryId; count: number }>
  categories: ScoringCategory[]
  nameOf: (id: number) => string
  seasonTotal: (id: number) => number
  historyFor: (id: number) => Array<{ episode: number; delta: number }>
  notes?: string
}): Recap {
  const { episode, events, categories, nameOf, seasonTotal, historyFor, notes } = args

  const epEvents = events.filter(e => e.episode === episode && e.count > 0)

  // Group by category so each rule becomes one news line.
  const byCat = new Map<ScoringCategoryId, number[]>()
  for (const e of epEvents) {
    if (!byCat.has(e.categoryId)) byCat.set(e.categoryId, [])
    byCat.get(e.categoryId)!.push(e.playerId)
  }

  // Group categories in scoring-table order so the digest reads consistently.
  const lines: RecapLine[] = []
  for (const cat of categories) {
    const ids = byCat.get(cat.id)
    if (!ids || ids.length === 0) continue
    const make = HEADLINE[cat.id]
    const headline = make ? make(ids.length, summarise(ids, nameOf)) : `${summarise(ids, nameOf)} - ${cat.label}`
    lines.push({
      categoryId: cat.id,
      categoryLabel: cat.label,
      group: cat.group,
      kind: 'gain',
      points: cat.points * ids.length,
      playerIds: ids,
      headline,
    })
  }

  // Per-player movement for this episode, across the whole roster.
  const deltas = new Map<number, number>()
  for (const e of epEvents) {
    const cat = categories.find(c => c.id === e.categoryId)
    if (!cat) continue
    deltas.set(e.playerId, (deltas.get(e.playerId) ?? 0) + cat.points * e.count)
  }

  const movers: PlayerMove[] = [...deltas.entries()].map(([playerId, delta]) => ({
    playerId,
    delta,
    history: historyFor(playerId),
    seasonTotal: seasonTotal(playerId),
  }))

  // Biggest risers first. Zero-movers are excluded: a flat week is not news.
  const moved = movers.filter(m => m.delta !== 0)
  const sorted = [...moved].sort((a, b) => b.delta - a.delta)

  return {
    episode,
    lines,
    notes: notes ? [notes] : [],
    movers: moved.sort((a, b) => b.delta - a.delta || a.playerId - b.playerId),
    top: sorted.slice(0, 3),
    totalAwarded: moved.reduce((s, m) => s + m.delta, 0),
  }
}

/** Group the digest by scoring group, preserving rule order. */
export function groupLines(lines: RecapLine[]): Array<{ group: string; lines: RecapLine[] }> {
  const out: Array<{ group: string; lines: RecapLine[] }> = []
  for (const line of lines) {
    let bucket = out.find(g => g.group === line.group)
    if (!bucket) { bucket = { group: line.group, lines: [] }; out.push(bucket) }
    bucket.lines.push(line)
  }
  return out
}
