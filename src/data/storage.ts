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
  /** Present when the row has a tribe assigned; null/omitted when not. */
  tribeId?: string | null
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
  /** Chips wagered on this pick. Optional for rows written before wagers. */
  stake?: number
  /** Cached result of settlement: 1 hit, 0 miss, null unresolved. */
  result?: number | null
}

export interface StateTribe {
  id: string
  name: string
  colorName: string
  color: string
  sortOrder: number
}

export interface StateSnapshot {
  players: StatePlayer[]   // may be empty on local backend; caller falls back to static
  tribes: StateTribe[]
  events: StateEvent[]
  overrides: StateOverride[]
  predictions: StatePrediction[]
  meta: Record<string, string>
}

export const EMPTY_SNAPSHOT: StateSnapshot = {
  players: [], tribes: [], events: [], overrides: [], predictions: [], meta: {},
}

export interface StorageBackend {
  readonly kind: 'local' | 'remote'
  load(): Promise<StateSnapshot>
  setEvent(e: StateEvent): Promise<void>
  setPlayerStatus(playerId: number, status: PlayerStatus): Promise<void>
  setPlayerManager(playerId: number, managerName: string | null): Promise<void>
  setOverride(o: StateOverride): Promise<void>
  setPrediction(p: StatePrediction): Promise<void>
  /** Free-form key/value writes, e.g. commissioner recap notes. */
  setMeta(key: string, value: string): Promise<void>
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
        tribes:      Array.isArray(parsed.tribes)      ? parsed.tribes      : [],
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

  async setMeta(key: string, value: string): Promise<void> {
    const s = this.read()
    s.meta = { ...s.meta, [key]: value }
    this.write(s)
  }
}

// ---- Remote backend (Vercel Postgres via /api/*) ---------------------------

// ---- Admin key (shared commissioner secret) --------------------------------
//
// Mutations to /api/* require this key in the X-Admin-Key header. The server
// no-ops the check when ADMIN_KEY is unset, so we only send it once the user
// has actually entered one.
//
// Kept in sessionStorage, not localStorage: the key should not outlive the
// browser tab, and it must never be baked into the bundle at build time.

const ADMIN_KEY_STORAGE = 'survivor_fantasy_admin_key'

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? ''
  } catch {
    return '' // private mode / storage blocked
  }
}

export function setAdminKey(key: string): void {
  try {
    if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key)
    else sessionStorage.removeItem(ADMIN_KEY_STORAGE)
  } catch {
    // Non-fatal: the request will 401 and the UI will surface it.
  }
}

/** Headers for an authenticated API call. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = getAdminKey()
  return key ? { ...extra, 'X-Admin-Key': key } : extra
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    // Wrong or missing key. Clear it so the next attempt asks again.
    setAdminKey('')
    throw new Error(
      'Unauthorized. Your admin key is missing or incorrect - set it in the Admin panel.',
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST ${url} failed: ${res.status} ${text}`)
  }
}

export class RemoteBackend implements StorageBackend {
  readonly kind = 'remote' as const
  constructor(private readonly baseUrl: string = '/api') {}

  async load(): Promise<StateSnapshot> {
    const res = await fetch(`${this.baseUrl}/state`, {
      headers: authHeaders({ accept: 'application/json' }),
    })
    if (!res.ok) throw new Error(`GET /state failed: ${res.status}`)
    const raw = (await res.json()) as any
    return {
      players:     Array.isArray(raw.players)     ? raw.players     : [],
      tribes:      Array.isArray(raw.tribes)      ? raw.tribes      : [],
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
  setMeta(key: string, value: string):                                 Promise<void> { return postJson(`${this.baseUrl}/meta`, { key, value }) }
}

// ---- Failed-write reporting -------------------------------------------------
//
// Mutations are optimistic: the UI updates immediately and the POST happens in
// the background. That is the right call for a fast tap-heavy UI, but a failed
// write used to be swallowed into console.error, leaving the user looking at a
// toggle that says "saved" when it never reached the server.
//
// The service now collects failures here so the UI can surface a toast and
// offer a retry. This is deliberately module-level rather than instance state:
// PlayerService instances are stable, and this is transport-level concern.

export interface FailedWrite {
  id: number
  /** What the user was doing, e.g. "Save score". */
  label: string
  message: string
  /** Re-attempts the write. Null when it cannot be retried safely. */
  retry: (() => void) | null
  at: number
}

let failed: FailedWrite[] = []
let nextId = 1
const listeners = new Set<(f: FailedWrite[]) => void>()

function emit(): void {
  for (const fn of listeners) fn(failed)
}

export function reportFailedWrite(label: string, err: unknown, retry: (() => void) | null): void {
  const message = err instanceof Error ? err.message : String(err)
  const entry: FailedWrite = { id: nextId++, label, message, retry, at: Date.now() }
  // Keep the list short; the newest failure is the one that matters.
  failed = [entry, ...failed].slice(0, 5)
  emit()
}

export function getFailedWrites(): FailedWrite[] {
  return failed
}

/** Dismiss one failure, or all of them. */
export function clearFailedWrite(id?: number): void {
  failed = id == null ? [] : failed.filter(f => f.id !== id)
  emit()
}

/** Re-run a failed write and drop it from the list. */
export function retryFailedWrite(id: number): void {
  const entry = failed.find(f => f.id === id)
  if (!entry) return
  clearFailedWrite(id)
  if (entry.retry) entry.retry()
}

/** Subscribe to failures. Returns an unsubscribe function. */
export function onFailedWrite(fn: (f: FailedWrite[]) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
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


