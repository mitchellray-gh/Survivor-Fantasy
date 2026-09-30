// GET /api/state -> full league state as JSON.
// This is the single "hydrate" endpoint the client hits on load.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors, hasDatabase, respondNoDb, handleError } from './_db.ts'
import { loadFullState } from './_state.ts'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (!hasDatabase()) { respondNoDb(res); return }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const state = await loadFullState()
    // No caching: this is authoritative and small.
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(state)
  } catch (err) {
    handleError(res, err)
  }
}
