// Storage adapter for the mutable league state.
//
// Two backends implement the same interface:
//
//   1. LocalStorageBackend  - offline fallback (npm run dev with no DB).
//   2. RemoteBackend        - talks to Vercel Postgres via /api/*
//
// The remote backend now uses a *relational* model: one GET /api/state hydrate
// followed by per-mutation POSTs (/api/events, /api/players, /api/overrides,
// /api/predictions). No single-blob PUT, no optimistic-concurrency version.
// If two people write at once the last write wins, which is fine for a
// tiny league with a single commissioner.

import type { ScoringCategoryId } from './scoringRules'

export type PlayerStatus = 'active' | 'voted_out' | 'medevac' | 'quit' | 'winner'

// Snapshot shape shared by both backends. It mirrors the /api/state JSON.
export interface StatePlayer {
  id: number
  name: string
  age: number | null
  hometown: string | null
  residence: string | null
  occupation: string | null
  aboutMe: string | null
  photo: string | null
  managerName: string | null
  status: PlayerStatus
}

export interface StateEvent {
  playerId: number
  episode: number
  categoryId: ScoringCategoryId
  count: number
}

export interface StateOverride {
  playerId: number
  episode: number
  delta: number
  reason: string | null
}

export interface StatePrediction {
  manager: string
  episode: number
  categoryId: ScoringCategoryId
  targetPlayerId: number | null
  locked: boolean
}

export interface StateSnapshot {
  players: StatePlayer[]   // may be empty on local backend; caller falls back to static
  events: StateEvent[]
  overrides: StateOverride[]
  predictions: StatePrediction[]
  meta: Record<string, string>
}

export const EMPTY_SNAPSHOT: StateSnapshot = {
  players: [], events: [], overrides: [], predictions: [], meta: {},
}

export interface StorageBackend {
  readonly kind: 'local' | 'remote'
  load(): Promise<StateSnapshot>
  setEvent(e: StateEvent): Promise<void>
  setPlayerStatus(playerId: number, status: PlayerStatus): Promise<void>
  setPlayerManager(playerId: number, managerName: string | null): Promise<void>
  setOverride(o: StateOverride): Promise<void>
  setPrediction(p: StatePrediction): Promise<void>
}

// ---- LocalStorage backend --------------------------------------------------
// A single JSON blob under one key. players[] stays empty; the service will
// merge these mutations onto the static PLAYERS[] roster from players.ts.

const LOCAL_KEY = 'survivor_fantasy_state_v2'

export class LocalStorageBackend implements StorageBackend {
  readonly kind = 'local' as const

  private read(): StateSnapshot {
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      if (!raw) return { ...EMPTY_SNAPSHOT }
      const parsed = JSON.parse(raw) as Partial<StateSnapshot>
      return {
        players:     Array.isArray(parsed.players)     ? parsed.players     : [],
        events:      Array.isArray(parsed.events)      ? parsed.events      : [],
        overrides:   Array.isArray(parsed.overrides)   ? parsed.overrides   : [],
        predictions: Array.isArray(parsed.predictions) ? parsed.predictions : [],
        meta:        (parsed.meta && typeof parsed.meta === 'object') ? parsed.meta as Record<string,string> : {},
      }
    } catch {
      return { ...EMPTY_SNAPSHOT }
    }
  }

  private write(s: StateSnapshot): void {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)) } catch { /* ignore quota */ }
  }

  async load(): Promise<StateSnapshot> { return this.read() }

  async setEvent(e: StateEvent): Promise<void> {
    const s = this.read()
    s.events = s.events.filter(x => !(x.playerId === e.playerId && x.episode === e.episode && x.categoryId === e.categoryId))
    if (e.count > 0) s.events.push({ ...e })
    this.write(s)
  }

  async setPlayerStatus(playerId: number, status: PlayerStatus): Promise<void> {
    const s = this.read()
    let found = false
    s.players = s.players.map(p => {
      if (p.id !== playerId) return p
      found = true
      return { ...p, status }
    })
    if (!found) {
      // Placeholder row that carries just id+status; the service overlays it.
      s.players.push({
        id: playerId, name: '', age: null, hometown: null, residence: null,
        occupation: null, aboutMe: null, photo: null, managerName: null, status,
      })
    }
    this.write(s)
  }

  async setPlayerManager(playerId: number, managerName: string | null): Promise<void> {
    const s = this.read()
    let found = false
    s.players = s.players.map(p => {
      if (p.id !== playerId) return p
      found = true
      return { ...p, managerName }
    })
    if (!found) {
      s.players.push({
        id: playerId, name: '', age: null, hometown: null, residence: null,
        occupation: null, aboutMe: null, photo: null, managerName, status: 'active',
      })
    }
    this.write(s)
  }

  async setOverride(o: StateOverride): Promise<void> {
    const s = this.read()
    s.overrides = s.overrides.filter(x => !(x.playerId === o.playerId && x.episode === o.episode))
    if (o.delta !== 0) s.overrides.push({ ...o })
    this.write(s)
  }

  async setPrediction(p: StatePrediction): Promise<void> {
    const s = this.read()
    s.predictions = s.predictions.filter(x => !(x.manager === p.manager && x.episode === p.episode && x.categoryId === p.categoryId))
    if (p.targetPlayerId !== null) s.predictions.push({ ...p })
    this.write(s)
  }
}

// ---- Remote backend (Vercel Postgres via /api/*) ---------------------------

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST ${url} failed: ${res.status} ${text}`)
  }
}

export class RemoteBackend implements StorageBackend {
  readonly kind = 'remote' as const
  constructor(private readonly baseUrl: string = '/api') {}

  async load(): Promise<StateSnapshot> {
    const res = await fetch(`${this.baseUrl}/state`, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`GET /state failed: ${res.status}`)
    const raw = (await res.json()) as any
    return {
      players:     Array.isArray(raw.players)     ? raw.players     : [],
      events:      Array.isArray(raw.events)      ? raw.events      : [],
      overrides:   Array.isArray(raw.overrides)   ? raw.overrides   : [],
      predictions: Array.isArray(raw.predictions) ? raw.predictions : [],
      meta:        (raw.meta && typeof raw.meta === 'object') ? raw.meta : {},
    }
  }

  setEvent(e: StateEvent):                                             Promise<void> { return postJson(`${this.baseUrl}/events`, e) }
  setPlayerStatus(id: number, status: PlayerStatus):                   Promise<void> { return postJson(`${this.baseUrl}/players`, { id, status }) }
  setPlayerManager(id: number, managerName: string | null):            Promise<void> { return postJson(`${this.baseUrl}/players`, { id, managerName }) }
  setOverride(o: StateOverride):                                       Promise<void> { return postJson(`${this.baseUrl}/overrides`, o) }
  setPrediction(p: StatePrediction):                                   Promise<void> { return postJson(`${this.baseUrl}/predictions`, p) }
}

// ---- Backend selection -----------------------------------------------------

/**
 * Picks the remote backend when VITE_USE_REMOTE=1 was set at build time.
 * Falls back to localStorage otherwise, so `npm run dev` on a laptop with
 * no DB configured still works.
 */
export function createBackend(): StorageBackend {
  const useRemote = (import.meta as any).env?.VITE_USE_REMOTE === '1'
  return useRemote ? new RemoteBackend() : new LocalStorageBackend()
}


