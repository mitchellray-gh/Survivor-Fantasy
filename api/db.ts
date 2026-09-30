// Shared server-side helpers for the Vercel Postgres (Neon) backend.
//
// All /api/*.ts endpoints import from here so they share connection setup,
// error handling, and the "full state" query.

import { createHash, timingSafeEqual } from 'node:crypto'
import { sql } from '@vercel/postgres'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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
  tribeId?: string | null
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
  stake: number
  result: number | null
}

export interface TribeRow {
  id: string
  name: string
  colorName: string
  color: string
  sortOrder: number
}

export interface FullState {
  schemaVersion: number
  tribes: TribeRow[]
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key')
}

// -- Admin auth ---------------------------------------------------------------
//
// Every mutating endpoint requires the shared commissioner key. The client
// sends it in the X-Admin-Key header; we compare against ADMIN_KEY from env.
//
// If ADMIN_KEY is unset the guard is a no-op (open), so local dev and any
// deployment that never set the key keeps working exactly as before. Set it
// in Vercel to actually turn the guard on.

export const ADMIN_KEY_HEADER = 'x-admin-key'

/** The configured key, or undefined when the guard is disabled. */
function adminKey(): string | undefined {
  const k = process.env.ADMIN_KEY
  return k && k.length > 0 ? k : undefined
}

/** True when ADMIN_KEY is set and enforcement is therefore active. */
export function isAuthEnabled(): boolean {
  return adminKey() !== undefined
}

/**
 * Constant-time string compare. Hashing first makes the two buffers a fixed
 * 32 bytes regardless of input length, so timingSafeEqual can't throw on a
 * length mismatch (and doesn't leak length via early return).
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Guard for mutating endpoints. Call AFTER applyCors/hasDatabase and after
 * the method check, but BEFORE touching the database.
 *
 * Responds 401 and returns false when the key is missing or wrong.
 */
export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const expected = adminKey()
  if (!expected) return true // guard disabled

  // Node's HTTP parser lowercases header names, so this is the normal path.
  // We still scan case-insensitively so the guard can't be bypassed by a
  // runtime that preserves the original casing.
  let provided: string | string[] | undefined = req.headers[ADMIN_KEY_HEADER]
  if (provided === undefined) {
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() === ADMIN_KEY_HEADER) { provided = v; break }
    }
  }
  const value = Array.isArray(provided) ? provided[0] : provided

  if (typeof value === 'string' && value.length > 0 && safeEqual(value, expected)) {
    return true
  }

  res.status(401).json({ error: 'Unauthorized: bad or missing admin key' })
  return false
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
