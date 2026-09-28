// DEPRECATED. The old single-blob Upstash Redis backend.
//
// The app now uses Vercel Postgres via /api/state (read) and the
// dedicated write endpoints (/api/events, /api/players, /api/overrides,
// /api/predictions). This handler is kept only so legacy clients get a
// clear error instead of a stale blob.
//
// You can safely delete this file once no old builds exist in the wild.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from './_db'

export default function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res, 'GET, PUT, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  res.status(410).json({
    error: 'This endpoint has been replaced. Use GET /api/state, POST /api/events, etc.',
  })
}
