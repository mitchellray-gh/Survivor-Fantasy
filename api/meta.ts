// POST /api/meta   body: { key, value }
//   Upserts one row in the free-form meta bag. Used for commissioner recap
//   notes (recap_note_ep1 = "Lewis missed the idol on Exile Island").
//
// Guarded by the admin key: meta is a global store, so a public write path
// would let anyone overwrite schema_version or the predictions lock.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applyCors, hasDatabase, respondNoDb, handleError,
  requireAdmin, requireStr, sql,
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
    const key = requireStr(body.key, 'key')
    const value = typeof body.value === 'string' ? body.value : ''

    await sql`
      INSERT INTO meta (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `

    res.status(200).json({ ok: true, key, value })
  } catch (err) {
    handleError(res, err)
  }
}
