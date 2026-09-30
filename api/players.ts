// PATCH /api/players   body: { id, status?, managerName? }
//   Updates a single player row. Only whitelisted fields are touched so a
//   caller can't rewrite arbitrary columns.
//
// Status must be one of: active, voted_out, medevac, quit, winner.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applyCors, hasDatabase, respondNoDb, handleError,
  requireAdmin, requireInt, sql, HttpError,
  type PlayerStatus,
} from './_db'

const VALID_STATUSES: PlayerStatus[] = ['active', 'voted_out', 'medevac', 'quit', 'winner']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res, 'PATCH, POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (!hasDatabase()) { respondNoDb(res); return }
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    res.setHeader('Allow', 'PATCH, POST, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    if (!requireAdmin(req, res)) return

    const body = (req.body ?? {}) as Record<string, unknown>
    const id = requireInt(body.id, 'id')

    const status = body.status as string | undefined
    const managerName = body.managerName as string | null | undefined

    if (status !== undefined && !VALID_STATUSES.includes(status as PlayerStatus)) {
      throw new HttpError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`)
    }

    // Two focused UPDATEs beat trying to build a dynamic SET clause with
    // the @vercel/postgres tagged-template API.
    if (status !== undefined) {
      await sql`
        UPDATE players SET status = ${status}, updated_at = NOW()
         WHERE id = ${id}
      `
    }
    if (managerName !== undefined) {
      await sql`
        UPDATE players SET manager_name = ${managerName}, updated_at = NOW()
         WHERE id = ${id}
      `
    }

    res.status(200).json({ ok: true, id })
  } catch (err) {
    handleError(res, err)
  }
}
