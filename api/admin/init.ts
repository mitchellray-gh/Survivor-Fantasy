// POST /api/admin/init
//   Creates all tables (idempotent) and seeds the reference data:
//     - managers (from playersdrafted assignments)
//     - players  (from src/data/players.ts, source of truth)
//     - scoring_categories (from src/data/scoringRules.ts)
//
// This is safe to re-run: seeds use INSERT ... ON CONFLICT DO NOTHING for
// rows that shouldn't be trampled, and ON CONFLICT DO UPDATE for reference
// data (name / photo / points) that should stay in sync with the code.
//
// Player `status` is NEVER overwritten by re-running init, so mid-season
// re-seeds won't accidentally revive voted-out castaways.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applyCors, hasDatabase, respondNoDb, handleError, requireAdmin, sql,
} from '../_db'
import { SCHEMA_STATEMENTS } from '../_schema'
import { PLAYERS } from '../../src/data/players'
import { SCORING_CATEGORIES } from '../../src/data/scoringRules'

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

    // 1. DDL. Each statement is run on its own; @vercel/postgres template
    //    literals only support a single statement per call.
    for (const stmt of SCHEMA_STATEMENTS) {
      await sql.query(stmt)
    }

    // 2. Managers - one row per unique managerName in the roster.
    const managerNames = Array.from(new Set(PLAYERS.map(p => p.managerName)))
      .filter(n => n && n.length > 0)
    for (const name of managerNames) {
      await sql`
        INSERT INTO managers(name) VALUES (${name})
        ON CONFLICT (name) DO NOTHING
      `
    }

    // 3. Scoring categories. Reference data - keep points in sync with code.
    for (let i = 0; i < SCORING_CATEGORIES.length; i++) {
      const c = SCORING_CATEGORIES[i]
      await sql`
        INSERT INTO scoring_categories (id, "group", label, points, sort_order)
        VALUES (${c.id}, ${c.group}, ${c.label}, ${c.points}, ${i})
        ON CONFLICT (id) DO UPDATE SET
          "group"    = EXCLUDED."group",
          label      = EXCLUDED.label,
          points     = EXCLUDED.points,
          sort_order = EXCLUDED.sort_order
      `
    }

    // 4. Players. Update reference fields (name/photo/manager/etc) on re-run
    //    but keep status untouched so an in-season re-init is non-destructive.
    let inserted = 0
    let updated  = 0
    for (const p of PLAYERS) {
      const before = await sql`SELECT 1 FROM players WHERE id = ${p.id}`
      const exists = before.rowCount ?? 0
      await sql`
        INSERT INTO players (id, name, age, hometown, residence, occupation,
                             about_me, photo, manager_name, status)
        VALUES (${p.id}, ${p.name}, ${p.age}, ${p.hometown}, ${p.residence},
                ${p.occupation}, ${p.aboutMe}, ${p.photo}, ${p.managerName},
                'active')
        ON CONFLICT (id) DO UPDATE SET
          name         = EXCLUDED.name,
          age          = EXCLUDED.age,
          hometown     = EXCLUDED.hometown,
          residence    = EXCLUDED.residence,
          occupation   = EXCLUDED.occupation,
          about_me     = EXCLUDED.about_me,
          photo        = EXCLUDED.photo,
          manager_name = EXCLUDED.manager_name,
          updated_at   = NOW()
      `
      if (exists) updated++; else inserted++
    }

    res.status(200).json({
      ok: true,
      managers: managerNames.length,
      categories: SCORING_CATEGORIES.length,
      playersInserted: inserted,
      playersUpdated: updated,
    })
  } catch (err) {
    handleError(res, err)
  }
}
