// Tribal structure for the season. Survivor is built around tribes, so the
// league needs this to sit alongside managers: two castaways on the same tribe
// can be drafted by rival managers.
//
// This is REFERENCE data, same status as scoring categories: it lives in code
// and is re-seeded by POST /api/admin/init. In-game STATUS (voted out, quit,
// winner) is deliberately NOT stored here - that is mutable league state owned
// by the admin drawer, and duplicating it here would give us two sources of
// truth that could disagree.

export type TribeId = 'savu' | 'toka' | 'exile'

export interface Tribe {
  id: TribeId
  /** Display name, e.g. "Savu". */
  name: string
  /** Parenthetical shown in headers, e.g. "Purple". */
  colorName: string
  /** Hex used for the tribe's accent badge/border. */
  color: string
  /** Sort order on the Tribes board. */
  order: number
}

export const TRIBES: Tribe[] = [
  { id: 'savu',  name: 'Savu',  colorName: 'Purple', color: '#7c3aed', order: 0 },
  { id: 'toka',  name: 'Toka',  colorName: 'Yellow', color: '#eab308', order: 1 },
  { id: 'exile', name: 'Exile', colorName: 'Isle',   color: '#ef4444', order: 2 },
]

const TRIBE_BY_ID = new Map(TRIBES.map(t => [t.id, t]))

export function getTribe(id: TribeId): Tribe | undefined {
  return TRIBE_BY_ID.get(id)
}

/**
 * Player id -> tribe, keyed off the ids in src/data/players.ts rather than
 * names so a castaway with a nickname (An "Thien An" Nguyen, Jelly, Kilby)
 * can't fall through on a string mismatch.
 */
export const PLAYER_TRIBES: Record<number, TribeId> = {
  // Savu (Purple)
  2:  'savu',  // Alexis
  4:  'savu',  // Ana
  7:  'savu',  // Carter
  8:  'savu',  // Cristian
  11: 'savu',  // Eric
  13: 'savu',  // Kristin
  15: 'savu',  // Linnea
  18: 'savu',  // Ori
  20: 'savu',  // Rob
  21: 'savu',  // Sharonda
  // Toka (Yellow)
  1:  'toka',  // Aaliyah
  3:  'toka',  // Thien An
  5:  'toka',  // Jelly
  6:  'toka',  // Brady
  9:  'toka',  // Kilby
  10: 'toka',  // Devin
  12: 'toka',  // Jenna
  16: 'toka',  // Maggie
  17: 'toka',  // Mike
  19: 'toka',  // Patt
  // Exile
  14: 'exile', // Lewis
}

export function tribeOf(playerId: number): TribeId | undefined {
  return PLAYER_TRIBES[playerId]
}
