// POST /api/admin/migrate-from-kv
//
// One-shot migration from the legacy single-blob storage in Upstash Redis
// (used by the old /api/league.ts endpoint) into the new Postgres tables.
//
// - Reads KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_* equivalents).
// - Reads key 'league:default' - shape { votedOut: number[], scores: [], version }.
// - Sets players.status = 'voted_out' for every id in votedOut.
// - Copies each EpisodeScoreDto into episode_events. Existing rows are
//   overwritten so re-running is safe.
//
// Returns a summary of what was copied. Safe to run more than once; safe
// to skip entirely if you never used the Upstash backend.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import {
  applyCors, hasDatabase, respondNoDb, handleError, requireAdmin, sql,
} from '../db.js'

interface LegacyEpisodeScore {
  playerId: number
  episode: number
  events: Record<string, number>
}
interface LegacyState {
  votedOut: number[]
  scores: LegacyEpisodeScore[]
  version: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (!hasDatabase()) { respondNoDb(res); return }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const kvUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const kvTok = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

  if (!kvUrl || !kvTok) {
    res.status(400).json({
      error: 'No Upstash KV credentials in env; nothing to migrate.',
    })
    return
  }

  try {
    if (!requireAdmin(req, res)) return

    const redis = new Redis({ url: kvUrl, token: kvTok })
    const legacy = (await redis.get<LegacyState>('league:default'))
      ?? { votedOut: [], scores: [], version: 0 }

    // 1. voted-out players
    let voted = 0
    for (const id of legacy.votedOut) {
      const r = await sql`
        UPDATE players SET status = 'voted_out', updated_at = NOW()
         WHERE id = ${id} AND status = 'active'
      `
      voted += r.rowCount ?? 0
    }

    // 2. scoring events
    let eventsCopied = 0
    for (const s of legacy.scores) {
      for (const [catId, count] of Object.entries(s.events ?? {})) {
        if (!Number.isFinite(count) || count <= 0) continue
        await sql`
          INSERT INTO episode_events (player_id, episode, category_id, count, updated_at)
          VALUES (${s.playerId}, ${s.episode}, ${catId}, ${Number(count)}, NOW())
          ON CONFLICT (player_id, episode, category_id)
          DO UPDATE SET count = EXCLUDED.count, updated_at = NOW()
        `
        eventsCopied++
      }
    }

    res.status(200).json({
      ok: true,
      legacyVersion: legacy.version,
      playersMarkedVotedOut: voted,
      eventsCopied,
    })
  } catch (err) {
    handleError(res, err)
  }
}
