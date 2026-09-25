// Storage adapter for the mutable "league state" (vote-outs + per-episode scoring).
//
// Two backends implement the same interface:
//
//   1. LocalStorageBackend  - always works, no server needed. Per-browser only.
//   2. RemoteBackend        - talks to /api/league (Vercel serverless + Vercel KV).
//                             Enabled by setting VITE_USE_REMOTE=1 at build time.
//
// The whole "current league state" is a single small JSON blob, so both backends
// are just get() and put(). Optimistic concurrency uses a monotonically
// increasing `version` field managed by the server.

import type { ScoringCategoryId } from './scoringRules'

export interface EpisodeScoreDto {
  playerId: number
  episode: number
  events: Partial<Record<ScoringCategoryId, number>>
}

export interface LeagueState {
  votedOut: number[]
  scores: EpisodeScoreDto[]
  version: number   // bumped by the server on every write
}

export const EMPTY_STATE: LeagueState = { votedOut: [], scores: [], version: 0 }

export interface StorageBackend {
  readonly kind: 'local' | 'remote'
  load(): Promise<LeagueState>
  save(state: LeagueState): Promise<LeagueState>  // returns state with new version
}

// ---- LocalStorage ----------------------------------------------------------

const LOCAL_KEY = 'survivor_fantasy_state_v1'

export class LocalStorageBackend implements StorageBackend {
  readonly kind = 'local' as const

  async load(): Promise<LeagueState> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      if (!raw) return { ...EMPTY_STATE }
      const parsed = JSON.parse(raw) as Partial<LeagueState>
      return {
        votedOut: Array.isArray(parsed.votedOut) ? parsed.votedOut : [],
        scores: Array.isArray(parsed.scores) ? parsed.scores : [],
        version: typeof parsed.version === 'number' ? parsed.version : 0,
      }
    } catch {
      return { ...EMPTY_STATE }
    }
  }

  async save(state: LeagueState): Promise<LeagueState> {
    const next = { ...state, version: state.version + 1 }
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  }
}

// ---- Remote (/api/league backed by Vercel KV) ------------------------------

export class RemoteBackend implements StorageBackend {
  readonly kind = 'remote' as const
  constructor(private readonly baseUrl: string = '/api/league') {}

  async load(): Promise<LeagueState> {
    const res = await fetch(this.baseUrl, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`GET ${this.baseUrl} failed: ${res.status}`)
    return (await res.json()) as LeagueState
  }

  async save(state: LeagueState): Promise<LeagueState> {
    const res = await fetch(this.baseUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    })
    if (res.status === 409) {
      // Conflict: someone else wrote first. Caller should reload and retry.
      throw new StorageConflictError()
    }
    if (!res.ok) throw new Error(`PUT ${this.baseUrl} failed: ${res.status}`)
    return (await res.json()) as LeagueState
  }
}

export class StorageConflictError extends Error {
  constructor() { super('League state was updated by someone else. Reload to see the latest.') }
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
