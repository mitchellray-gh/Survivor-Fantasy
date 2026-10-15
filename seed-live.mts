import { SEED_EVENTS, seedStatuses, SEED_VERSION } from './src/data/episodeScores.js'

const BASE = 'https://survivor-fantasy-six.vercel.app'
const KEY = 'survive' as const

function auth() {
  return { headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY } }
}

async function req(path: string, body: unknown) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: auth().headers,
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  let j: unknown = null
  try { j = JSON.parse(txt) } catch { /* non-JSON */ }
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${txt.slice(0, 200)}`)
  return j
}

// 1. Canonical seed from the repo source of truth.
const seeded = 0

async function run() {
  let sent = 0
  for (const e of SEED_EVENTS) {
    const j = await req('/api/events', e)
    if (j.ok) sent++
  }
  console.log('events upserted:', sent)

  // 2. Player statuses from the exit record - only where the row is still active.
  const state0 = await (await fetch(BASE + '/api/state', auth())).json() as {
    players: Array<{ id: number; status: string }>
  }
  const byId = new Map(state0.players.map(p => [p.id, p]))
  let changed = 0
  for (const [playerId, status] of seedStatuses()) {
    const p = byId.get(playerId)
    if (p && p.status === 'active') {
      await req('/api/players', { id: playerId, status })
      changed++
    }
  }
  console.log('statuses applied:', changed)

  // 3. Point the UI at the next episode; mark the seed version applied.
  await req('/api/meta', { key: 'current_episode', value: '4' })
  await req('/api/meta', { key: 'seed_version', value: String(SEED_VERSION) })
  for (const ep of [2, 3]) {
    await req('/api/meta', { key: `seed_ep${ep}_applied`, value: String(SEED_VERSION) })
  }
  console.log('meta set: current_episode=4, seed_version=2, per-episode flags')

  // 4. Post-seed summary from /api/state.
  const state1 = await (await fetch(BASE + '/api/state', auth())).json() as {
    events: Array<{ episode: number }>
    meta: Record<string, string>
    players: Array<{ id: number; status: string }>
  }
  const eps = Array.from(new Set(state1.events.map(e => e.episode))).sort((a, b) => a - b)
  const st = [...new Map(state1.players.map(p => [p.id, p.status])).entries()]
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')
  console.log('\npost-seed: episodes =', eps.join(','))
  console.log('meta      =', JSON.stringify(state1.meta))
  console.log('statuses  =', st)
}

run().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
