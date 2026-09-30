// POST /api/overrides    body: { playerId, episode, delta, reason? }
//   Upserts a single commissioner adjustment. delta=0 deletes the row.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applyCors, hasDatabase, respondNoDb, handleError,
  requireAdmin, requireInt, sql,
} from './db.js'

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
    const playerId = requireInt(body.playerId, 'playerId')
    const episode  = requireInt(body.episode,  'episode')
    const delta    = requireInt(body.delta,    'delta')
    const reason   = typeof body.reason === 'string' ? body.reason : null

    if (delta === 0) {
      await sql`
        DELETE FROM score_overrides
         WHERE player_id = ${playerId} AND episode = ${episode}
      `
    } else {
      await sql`
        INSERT INTO score_overrides (player_id, episode, delta, reason, updated_at)
        VALUES (${playerId}, ${episode}, ${delta}, ${reason}, NOW())
        ON CONFLICT (player_id, episode)
        DO UPDATE SET delta = EXCLUDED.delta, reason = EXCLUDED.reason, updated_at = NOW()
      `
    }

    res.status(200).json({ ok: true, playerId, episode, delta })
  } catch (err) {
    handleError(res, err)
  }
}
