// POST /api/predictions   body: { manager, episode, categoryId, targetPlayerId? }
//   Upserts one prediction. targetPlayerId=null clears it.
//   Rejected with 409 when meta.predictions_locked = 'true'.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applyCors, hasDatabase, respondNoDb, handleError,
  requireAdmin, requireInt, requireStr, sql, HttpError,
} from './_db.ts'

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

    const locked = await sql`SELECT value FROM meta WHERE key = 'predictions_locked'`
    if (locked.rows[0]?.value === 'true') {
      throw new HttpError(409, 'Predictions are locked by the commissioner')
    }

    if (targetPlayerId === null) {
      await sql`
        DELETE FROM predictions
         WHERE manager = ${manager} AND episode = ${episode} AND category_id = ${categoryId}
      `
    } else {
      await sql`
        INSERT INTO predictions (manager, episode, category_id, target_player_id)
        VALUES (${manager}, ${episode}, ${categoryId}, ${targetPlayerId})
        ON CONFLICT (manager, episode, category_id)
        DO UPDATE SET target_player_id = EXCLUDED.target_player_id
      `
    }

    res.status(200).json({ ok: true, manager, episode, categoryId, targetPlayerId })
  } catch (err) {
    handleError(res, err)
  }
}
