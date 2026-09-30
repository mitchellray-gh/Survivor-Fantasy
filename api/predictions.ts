// POST /api/predictions   body: { manager, episode, categoryId, targetPlayerId? }
//   Upserts one prediction. targetPlayerId=null clears it.
//   Rejected with 409 when meta.predictions_locked = 'true'.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applyCors, hasDatabase, respondNoDb, handleError,
  requireAdmin, requireInt, requireStr, sql, HttpError,
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
    const manager    = requireStr(body.manager,    'manager')
    const episode    = requireInt(body.episode,    'episode')
    const categoryId = requireStr(body.categoryId, 'categoryId')
    const target = body.targetPlayerId
    const targetPlayerId = target == null ? null : requireInt(target, 'targetPlayerId')
    const stake = body.stake == null ? 0 : requireInt(body.stake, 'stake')
    const result = body.result === null || body.result === undefined ? null : requireInt(body.result, 'result')

    // Re-picking is closed once the commissioner locks the week. Settlement
    // writes (result non-null) are still allowed so a scored episode can be
    // marked even after the board is locked.
    const locked = await sql`SELECT value FROM meta WHERE key = 'predictions_locked'`
    if (locked.rows[0]?.value === 'true' && result === null) {
      throw new HttpError(409, 'Predictions are locked by the commissioner')
    }

    if (targetPlayerId === null) {
      await sql`
        DELETE FROM predictions
         WHERE manager = ${manager} AND episode = ${episode} AND category_id = ${categoryId}
      `
    } else {
      await sql`
        INSERT INTO predictions (manager, episode, category_id, target_player_id, stake, result)
        VALUES (${manager}, ${episode}, ${categoryId}, ${targetPlayerId}, ${stake}, ${result})
        ON CONFLICT (manager, episode, category_id)
        DO UPDATE SET target_player_id = EXCLUDED.target_player_id,
                      stake             = EXCLUDED.stake,
                      result            = EXCLUDED.result
      `
    }

    res.status(200).json({ ok: true, manager, episode, categoryId, targetPlayerId, stake, result })
  } catch (err) {
    handleError(res, err)
  }
}
