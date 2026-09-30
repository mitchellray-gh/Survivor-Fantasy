// "Desk read" persona analysis.
//
// This reads each castaway's own CBS bio (players.ts `aboutMe`) and looks for
// language that historically correlates with how someone plays the game. It is
// a keyword heuristic, not a prediction engine, and the UI labels it as a bot
// opinion so nobody mistakes it for gospel. Every quote shown back to the user
// is lifted verbatim from their own bio so the reasoning is auditable.

import type { Player } from './players.js'

export type SignalKey =
  | 'competitive'
  | 'strategic'
  | 'social'
  | 'physical'
  | 'underdog'
  | 'loyal'
  | 'volatile'

export interface SignalDef {
  key: SignalKey
  label: string
  blurb: string
  /** Substrings matched case-insensitively against the bio. */
  terms: string[]
}

export const SIGNALS: SignalDef[] = [
  {
    key: 'competitive',
    label: 'Competitive',
    blurb: 'Talks about winning, fighting and proving herself.',
    terms: [
      'competitive', 'win', 'winner', 'winning', 'fight', 'fighting', 'battle',
      'cutthroat', 'destroy', 'beat', 'crush', 'take no prisoners', 'fierce',
      'war', 'attack', 'go for the win', 'nothing to lose',
    ],
  },
  {
    key: 'strategic',
    label: 'Strategic',
    blurb: 'Frames the game in terms of plans, angles and manipulation.',
    terms: [
      'strategy', 'strategic', 'plan', 'planning', 'smart', 'intelligent',
      'calculat', 'game', 'scheming', 'manipulat', 'read people',
      'social politics', 'jury', 'loyalty', 'outsmart', 'poker', 'chess',
    ],
  },
  {
    key: 'social',
    label: 'Connector',
    blurb: 'Builds relationships; likely to hold a coalition together.',
    terms: [
      'friend', 'friendship', 'family', 'love', 'loyal', 'trust', 'connect',
      'relationship', 'people person', 'emotional', 'empathy', 'care',
      'community', 'allies', 'bond', 'together', 'supportive',
    ],
  },
  {
    key: 'physical',
    label: 'Athletic',
    blurb: 'Leads with physical ability; a challenge threat.',
    terms: [
      'athletic', 'athlete', 'sport', 'fitness', 'gym', 'run', 'running',
      'swim', 'strong', 'muscle', 'physical', 'compete physically', 'crossfit',
      'basketball', 'football', 'soccer', 'tennis', 'boxing', 'martial',
    ],
  },
  {
    key: 'underdog',
    label: 'Underdog',
    blurb: 'Self-describes as overlooked or unproven. High variance.',
    terms: [
      'underdog', 'overlooked', 'no one', 'nobody', 'prove', 'proving',
      'first time', 'never', 'rookie', 'untested', 'not been',
      'surprise', 'unexpected',
    ],
  },
  {
    key: 'loyal',
    label: 'Loyal',
    blurb: 'Likely to stick with an alliance rather than flip.',
    terms: [
      'loyal', 'loyalty', 'commit', 'promise', 'word', 'honest', 'integrity',
      'stay loyal', 'keep my word', 'faith',
    ],
  },
  {
    key: 'volatile',
    label: 'Volatile',
    blurb: 'Prone to emotional swings. Boom-or-bust pick.',
    terms: [
      'cry', 'cries', 'crying', 'tear', 'emotional', 'dramatic', 'hot head',
      'temper', 'volatile', 'impulsive', 'spontaneous', 'chaos', 'chaotic',
      'unexpected', 'wild card', 'unpredictable',
    ],
  },
]

export interface PersonaSignal {
  key: SignalKey
  label: string
  blurb: string
  /** 0-100, relative to the strongest signal on this cast. */
  strength: number
  /** Verbatim snippet from the bio that triggered this signal. */
  quote: string
}

export interface Persona {
  playerId: number
  /** 0-100 composite "heat". Higher = the desk likes them more. */
  heat: number
  /** Highest-scoring signal; null when the bio matched nothing. */
  dominant: PersonaSignal | null
  signals: PersonaSignal[]
  /** One-line verdict, e.g. "Likely immunity threat". */
  verdict: string
}

/** Score one bio against every signal definition. */
function analyseBio(player: Player): PersonaSignal[] {
  const bio = (player.aboutMe || '').toLowerCase()

  const found: PersonaSignal[] = []
  for (const def of SIGNALS) {
    // Longest term first so "take no prisoners" beats "no".
    const hits = [...def.terms].sort((a, b) => b.length - a.length)

    let best: { term: string; count: number } | null = null
    for (const term of hits) {
      let count = 0
      let idx = bio.indexOf(term)
      while (idx !== -1) {
        count++
        idx = bio.indexOf(term, idx + term.length)
      }
      if (count > 0 && (!best || count > best.count)) best = { term, count }
    }
    if (best) {
      // Pull the original-cased sentence around the match for the quote.
      const i = (player.aboutMe || '').toLowerCase().indexOf(best.term)
      const quote = extractSnippet(player.aboutMe || '', i, best.term.length)
      found.push({
        key: def.key,
        label: def.label,
        blurb: def.blurb,
        strength: 0,
        quote,
      })
    }
  }
  return found
}

/** Grab a readable sentence containing the match. */
function extractSnippet(text: string, at: number, len: number): string {
  if (at < 0) return ''
  let start = at
  let end = at + len
  // Walk back to the previous sentence boundary.
  for (let i = at; i > 0 && at - i < 160; i--) {
    if (/[.?!]/.test(text[i])) { start = i + 1; break }
  }
  for (let i = end; i < text.length && i - end < 160; i++) {
    if (/[.?!"]/.test(text[i])) { end = i + 1; break }
  }
  return text.slice(start, end).trim().replace(/^["\s]+|["\s]+$/g, '')
}


/**
 * Per-market persona weighting. For each prediction market, which signals make
 * someone a likelier picker. Weights are the desk's editorial judgement, not
 * a statistical model.
 */
const MARKET_AFFINITY: Record<string, Partial<Record<SignalKey, number>>> = {
  individual_immunity:      { physical: 1.0, competitive: 0.7, strategic: 0.4, underdog: -0.2 },
  individual_reward:        { competitive: 0.8, physical: 0.6, strategic: 0.5, loyal: 0.2 },
  found_idol_or_advantage:  { strategic: 0.9, underdog: 0.5, competitive: 0.4, loyal: -0.3 },
  played_idol_successfully: { strategic: 1.0, competitive: 0.5, loyal: -0.4, underdog: 0.3 },
  first_to_cry:             { volatile: 1.0, social: 0.5, underdog: 0.3, competitive: -0.2 },
}

/**
 * Projected "price" for one player in one market: higher means the desk thinks
 * they are more likely to hit it. Combines the persona affinity above with
 * their raw heat. This is the number the UI shows as a percentage.
 */
export function projectOdds(player: Player, marketId: string, personas: Map<number, Persona>): number {
  const p = personas.get(player.id)
  if (!p) return 0

  const affinity = MARKET_AFFINITY[marketId]
  if (!affinity) return Math.round(p.heat * 0.5)

  let score = 50 // baseline: no signal either way
  for (const sig of p.signals) {
    const w = affinity[sig.key] ?? 0
    if (w === 0) continue
    score += w * (sig.strength / 100) * 50
  }
  // Nudge by overall heat so a broadly-strong bio edges out a narrow one.
  score += (p.heat - 50) * 0.3

  // Eliminated players can't win anything.
  if (player.votedOut) score = Math.min(score, 5)

  return Math.max(3, Math.min(97, Math.round(score)))
}

function verdictFor(dominant: PersonaSignal | null, player: Player): string {
  if (!dominant) return 'Limited read - the bio gave us nothing to work with.'
  if (dominant.key === 'physical') return 'Physical threat. Immunity favourite.'
  if (dominant.key === 'strategic') return 'Plays the long game. Advantage player.'
  if (dominant.key === 'competitive') return 'Wants it badly. Expect fireworks.'
  if (dominant.key === 'social') return 'Coalition glue. Unlikely to be cut early.'
  if (dominant.key === 'volatile') return 'Boom or bust. High variance pick.'
  if (dominant.key === 'underdog') return 'Unproven. Could be a spoiler.'
  if (dominant.key === 'loyal') return 'Sticks with an alliance. Hard to flip.'
  return player.votedOut ? 'Out of the game.' : 'Hard to read.'
}

/** Analyse an entire cast, returning a persona per player id. */
export function analyseCast(players: Player[]): Map<number, Persona> {
  // Pass 1: collect raw signal hits per player.
  const raw = new Map<number, PersonaSignal[]>()
  for (const p of players) raw.set(p.id, analyseBio(p))

  // Pass 2: score each signal from how many distinct terms matched, normalised
  // against the strongest signal on this cast so "heat" is relative to the
  // season rather than an absolute constant.
  const termHits = new Map<number, Map<string, number>>()
  for (const p of players) {
    const bio = (p.aboutMe || '').toLowerCase()
    const perSignal = new Map<string, number>()
    for (const def of SIGNALS) {
      let n = 0
      for (const term of def.terms) if (bio.includes(term)) n++
      perSignal.set(def.key, n)
    }
    termHits.set(p.id, perSignal)
  }

  let maxTerms = 1
  for (const m of termHits.values()) for (const n of m.values()) maxTerms = Math.max(maxTerms, n)

  const out = new Map<number, Persona>()
  for (const p of players) {
    const hits = raw.get(p.id) ?? []
    const per = termHits.get(p.id) ?? new Map<string, number>()

    const sigs = hits
      .map(s => ({ ...s, strength: Math.round(((per.get(s.key) ?? 0) / maxTerms) * 100) }))
      .sort((a, b) => b.strength - a.strength)

    const dominant = sigs[0] ?? null
    // Heat: breadth of read (how many distinct signals) weighted by strength.
    const breadth = Math.min(sigs.length, 5) * 12
    const peak = dominant ? dominant.strength : 0
    let heat = Math.round(breadth + peak * 0.45)
    if (p.votedOut) heat = Math.round(heat * 0.6)
    heat = Math.max(5, Math.min(99, heat))

    out.set(p.id, { playerId: p.id, heat, dominant, signals: sigs, verdict: verdictFor(dominant, p) })
  }
  return out
}
