// Loads the full league state as one JSON blob for the /api/state endpoint.
// Kept separate from _db.ts so files stay short and easier to review.

import { sql, type FullState, type PlayerStatus } from './_db'

export async function loadFullState(): Promise<FullState> {
  const [tribes, managers, players, categories, events, overrides, predictions, meta] = await Promise.all([
    sql`SELECT id, name, color_name, color, sort_order FROM tribes ORDER BY sort_order, id`,
    sql`SELECT name, display_name FROM managers ORDER BY name`,
    sql`SELECT id, name, age, hometown, residence, occupation, about_me, photo,
               manager_name, status
        FROM players ORDER BY id`,
    sql`SELECT id, "group", label, points, sort_order
        FROM scoring_categories ORDER BY sort_order, id`,
    sql`SELECT player_id, episode, category_id, count FROM episode_events`,
    sql`SELECT player_id, episode, delta, reason FROM score_overrides`,
    sql`SELECT manager, episode, category_id, target_player_id, locked FROM predictions`,
    sql`SELECT key, value FROM meta`,
  ])

  const metaObj: Record<string, string> = {}
  for (const row of meta.rows) metaObj[String(row.key)] = String(row.value)

  return {
    schemaVersion: Number(metaObj.schema_version ?? '1'),
    tribes: tribes.rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      colorName: String(r.color_name),
      color: String(r.color),
      sortOrder: Number(r.sort_order),
    })),
    managers: managers.rows.map(r => ({
      name: String(r.name),
      displayName: r.display_name == null ? null : String(r.display_name),
    })),
    players: players.rows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      age: r.age == null ? null : Number(r.age),
      hometown: r.hometown == null ? null : String(r.hometown),
      residence: r.residence == null ? null : String(r.residence),
      occupation: r.occupation == null ? null : String(r.occupation),
      aboutMe: r.about_me == null ? null : String(r.about_me),
      photo: r.photo == null ? null : String(r.photo),
      managerName: r.manager_name == null ? null : String(r.manager_name),
      status: (String(r.status) as PlayerStatus),
    })),
    categories: categories.rows.map(r => ({
      id: String(r.id),
      group: String(r.group),
      label: String(r.label),
      points: Number(r.points),
      sortOrder: Number(r.sort_order),
    })),
    events: events.rows.map(r => ({
      playerId: Number(r.player_id),
      episode: Number(r.episode),
      categoryId: String(r.category_id),
      count: Number(r.count),
    })),
    overrides: overrides.rows.map(r => ({
      playerId: Number(r.player_id),
      episode: Number(r.episode),
      delta: Number(r.delta),
      reason: r.reason == null ? null : String(r.reason),
    })),
    predictions: predictions.rows.map(r => ({
      manager: String(r.manager),
      episode: Number(r.episode),
      categoryId: String(r.category_id),
      targetPlayerId: r.target_player_id == null ? null : Number(r.target_player_id),
      locked: Boolean(r.locked),
    })),
    meta: metaObj,
  }
}
