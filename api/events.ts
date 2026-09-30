// POST /api/events   body: { playerId, episode, categoryId, count }
//   Upserts one row in episode_events. count=0 deletes the row so the table
//   stays clean (episodes with zero events don't accumulate junk).
//
// The client uses count=1 for boolean-style events (toggle -> 1 or 0) and
// count=N for numeric events like "sat out 2 challenges".

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applyCors, hasDatabase, respondNoDb, handleError,
  requireAdmin, requireInt, requireStr, sql,
} from './_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (!hasDatabase()) { respondNoDb(res); return }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    if (!requireAdmin(req, res)) return

    const body = (req.body ?? {}) as Record<string, unknown>
    const playerId   = requireInt(body.playerId,   'playerId')
    const episode    = requireInt(body.episode,    'episode')
    const categoryId = requireStr(body.categoryId, 'categoryId')
    const count      = requireInt(body.count,      'count')

    if (count <= 0) {
      await sql`
        DELETE FROM episode_events
         WHERE player_id = ${playerId}
           AND episode   = ${episode}
           AND category_id = ${categoryId}
      `
    } else {
      await sql`
        INSERT INTO episode_events (player_id, episode, category_id, count, updated_at)
        VALUES (${playerId}, ${episode}, ${categoryId}, ${count}, NOW())
        ON CONFLICT (player_id, episode, category_id)
        DO UPDATE SET count = EXCLUDED.count, updated_at = NOW()
      `
    }

    res.status(200).json({ ok: true, playerId, episode, categoryId, count })
  } catch (err) {
    handleError(res, err)
  }
}
