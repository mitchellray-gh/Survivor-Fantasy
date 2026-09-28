// Shared server-side helpers for the Vercel Postgres (Neon) backend.
//
// All /api/*.ts endpoints import from here so they share connection setup,
// error handling, and the "full state" query.

import { sql } from '@vercel/postgres'
import type { VercelResponse } from '@vercel/node'

export { sql }

// -- Types shared with the client ---------------------------------------------
// These mirror the JSON shape /api/state returns.

export type PlayerStatus = 'active' | 'voted_out' | 'medevac' | 'quit' | 'winner'

export interface PlayerRow {
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

export interface ManagerRow { name: string; displayName: string | null }

export interface ScoringCategoryRow {
  id: string
  group: string
  label: string
  points: number
  sortOrder: number
}

export interface EpisodeEventRow {
  playerId: number
  episode: number
  categoryId: string
  count: number
}

export interface ScoreOverrideRow {
  playerId: number
  episode: number
  delta: number
  reason: string | null
}

export interface PredictionRow {
  manager: string
  episode: number
  categoryId: string
  targetPlayerId: number | null
  locked: boolean
}

export interface FullState {
  schemaVersion: number
  managers: ManagerRow[]
  players: PlayerRow[]
  categories: ScoringCategoryRow[]
  events: EpisodeEventRow[]
  overrides: ScoreOverrideRow[]
  predictions: PredictionRow[]
  meta: Record<string, string>
}

// -- Env / availability -------------------------------------------------------

/** True when a Postgres URL is present in env. Vercel + Neon sets these. */
export function hasDatabase(): boolean {
  return Boolean(
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
  )
}

/** Standard "no DB attached yet" response. */
export function respondNoDb(res: VercelResponse): void {
  res.status(503).json({
    error: 'No Postgres database attached to this deployment. ' +
      'In Vercel: Storage -> Marketplace -> Neon, then redeploy. ' +
      'Locally: vercel env pull .env.development.local.',
  })
}

// -- CORS helper --------------------------------------------------------------

export function applyCors(res: VercelResponse, methods: string): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

// -- Small guards / error handling -------------------------------------------

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export function requireInt(v: unknown, name: string): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new HttpError(400, `Expected integer for ${name}`)
  }
  return n
}

export function requireStr(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new HttpError(400, `Expected non-empty string for ${name}`)
  }
  return v
}

export function handleError(res: VercelResponse, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error('[api] unexpected error:', err)
  const msg = err instanceof Error ? err.message : 'Internal error'
  res.status(500).json({ error: msg })
}
