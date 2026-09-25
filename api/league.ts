// Vercel serverless function - single endpoint that reads/writes the whole
// league state as one JSON blob in Upstash Redis (the current successor to
// the deprecated Vercel KV, connected via Vercel Marketplace).
//
// GET  /api/league  -> { votedOut, scores, version }
// PUT  /api/league  -> body: { votedOut, scores, version }
//                       returns 409 if the incoming version does not match
//                       the current server version (optimistic concurrency).
//
// Setup: Vercel dashboard -> Storage -> Marketplace -> add Upstash Redis (or
// Vercel's built-in KV, which forwards to Upstash under the hood). Both
// paths inject KV_REST_API_URL and KV_REST_API_TOKEN as env vars, and both
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN if you install the
// Upstash integration directly. We read whichever pair is present.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

// The client is created lazily so a preview deploy without a database
// attached returns a clean 503 instead of crashing at cold-start.
const redis = url && token ? new Redis({ url, token }) : null

const KEY = 'league:default'

interface LeagueState {
  votedOut: number[]
  scores: unknown[]
  version: number
}

const EMPTY: LeagueState = { votedOut: [], scores: [], version: 0 }

function isValid(x: any): x is LeagueState {
  return x
    && Array.isArray(x.votedOut) && x.votedOut.every((v: any) => typeof v === 'number')
    && Array.isArray(x.scores)
    && typeof x.version === 'number'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS - only really needed if you host the front-end on a different origin.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (!redis) {
    res.status(503).json({
      error: 'No database attached. Add an Upstash Redis (or Vercel KV) store to this project.',
    })
    return
  }

  try {
    if (req.method === 'GET') {
      const stored = (await redis.get<LeagueState>(KEY)) ?? EMPTY
      res.status(200).json(stored)
      return
    }

    if (req.method === 'PUT') {
      const incoming = req.body as any
      if (!isValid(incoming)) {
        res.status(400).json({ error: 'Invalid payload' })
        return
      }

      const current = (await redis.get<LeagueState>(KEY)) ?? EMPTY

      // Optimistic concurrency: the client sent us the version it started
      // from; if the server has moved on since, refuse the write.
      if (incoming.version !== current.version) {
        res.status(409).json({ error: 'Version conflict', current })
        return
      }

      const next: LeagueState = {
        votedOut: incoming.votedOut,
        scores: incoming.scores,
        version: current.version + 1,
      }
      await redis.set(KEY, next)
      res.status(200).json(next)
      return
    }

    res.setHeader('Allow', 'GET, PUT, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/league] error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
}
