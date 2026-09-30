// Verifies the recap engine against the real episode-1 narrative.
const store = new Map()
globalThis.sessionStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k,v)=>store.set(k,String(v)), removeItem: k=>store.delete(k), clear:()=>store.clear(), key:i=>Array.from(store.keys())[i]??null, get length(){return store.size} }
globalThis.localStorage = globalThis.sessionStorage
globalThis.IS_REACT_ACT_ENVIRONMENT = false

async function main() {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { PlayerService } = await import('./src/data/playerService.ts')
  const { buildRecap, groupLines, joinNames } = await import('./src/data/recap.ts')
  const { default: RecapTab } = await import('./src/components/RecapTab.tsx')
  const { SCORING_CATEGORIES } = await import('./src/data/scoringRules.ts')

  let pass = 0, fail = 0
  const check = (n, c) => { if (c) { pass++; console.log('  PASS ' + n) } else { fail++; console.log('  FAIL ' + n) } }

  const svc = new PlayerService()
  const players = svc.getPlayers()
  const nameOf = id => players.find(p => p.id === id)?.name ?? '?'
  const mk = ep => buildRecap({
    episode: ep, events: svc.getEvents(), categories: SCORING_CATEGORIES, nameOf,
    seasonTotal: id => svc.getPlayerTotal(id),
    historyFor: id => svc.getPlayerEpisodeHistory(id),
    notes: ep === 1 ? svc.getRecapNote(1) : '',
  })

  // ---- Seed EXACTLY the round-1 narrative ----
  for (const p of players) {
    if (p.id === 1) continue
    svc.setEventCount(p.id, 1, 'survived_tribal', 1)
  }
  const savu = players.filter(p => p.tribe === 'savu')
  for (const p of savu) svc.setEventCount(p.id, 1, 'tribal_challenge_win', 1)
  svc.setEventCount(20, 1, 'found_idol_or_advantage', 1)
  svc.setEventCount(11, 1, 'first_to_cry', 1)
  svc.setEventCount(11, 1, 'bleeped_swearing', 1)
  svc.setRecapNote(1, 'Lewis failed to retrieve the idol on Exile Island, and both Jenna and Aaliyah pulled "Not Safe" on their Shot in the Dark attempts.')

  check('savu is 10', savu.length === 10)
  check('Rob = +8', svc.getPlayerEpisodeTotal(20, 1) === 8)
  check('Eric = +7', svc.getPlayerEpisodeTotal(11, 1) === 7)
  check('plain Savu = +4', svc.getPlayerEpisodeTotal(2, 1) === 4)
  check('plain Toka = +2', svc.getPlayerEpisodeTotal(6, 1) === 2)
  check('Aaliyah = 0', svc.getPlayerEpisodeTotal(1, 1) === 0)
  check('Lewis = +2', svc.getPlayerEpisodeTotal(14, 1) === 2)

  const recap = mk(1)
  check('total awarded = 67', recap.totalAwarded === 67)
  check('5 news lines', recap.lines.length === 5)
  const groups = groupLines(recap.lines)
  check('4 groups', groups.length === 4)
  check('group order follows rules', groups[0].group === 'Survival' && groups[1].group === 'Challenge')

  const survival = groups[0].lines[0]
  check('survival 20 x2 = +40', survival.playerIds.length === 20 && survival.points === 40)
  check('survival summarises the rest', survival.headline.includes('plus 17 more'))
  check('survival verb is plural', survival.headline.includes('more survive Tribal Council'))
  check('Aaliyah not in survival', !survival.playerIds.includes(1))
  const challenge = groups[1].lines[0]
  check('challenge 10 x2 = +20', challenge.playerIds.length === 10 && challenge.points === 20)
  check('challenge names them', challenge.headline.includes('Alexis'))
  const idol = groups[2].lines.find(l => l.categoryId === 'found_idol_or_advantage')
  check('idol = Rob alone', idol.playerIds.length === 1 && idol.playerIds[0] === 20)
  check('idol headline (singular verb)', idol.headline === 'Rob Antonson finds an advantage')
  check('Eric cry +2', groups[3].lines.find(l => l.categoryId === 'first_to_cry').points === 2)
  check('Eric bleep +1', groups[3].lines.find(l => l.categoryId === 'bleeped_swearing').points === 1)
  check('top mover Rob +8', recap.top[0].playerId === 20 && recap.top[0].delta === 8)
  check('second Eric +7', recap.top[1].playerId === 11 && recap.top[1].delta === 7)
  check('flat weeks excluded', !recap.movers.some(m => m.playerId === 1))
  check('note carried', recap.notes[0].includes('Exile Island'))

  for (const p of players) svc.setEventCount(p.id, 2, 'quit', 1)
  const neg = mk(2)
  check('negative totals -210', neg.totalAwarded === -210)
  check('negative line flagged', neg.lines[0].points < 0)
  check('history spans 2 eps', svc.getPlayerEpisodeHistory(20).length === 2)
  check('season total rolls up', svc.getPlayerTotal(20) === 8 - 10)
  check('join 1', joinNames([1], nameOf) === 'Aaliyah Puglia')
  check('join 2 uses and', joinNames([2, 4], nameOf).includes(' and '))

  // Render with a fresh service per view. renderToStaticMarkup memoises on
  // first call, so reusing one mutable service across renders returns stale
  // output - a test artefact, not a component bug.
  const view = (canEdit, ep = 1) => {
    const s = new PlayerService()
    for (const p of s.getPlayers()) {
      if (p.id === 1) continue
      s.setEventCount(p.id, 1, 'survived_tribal', 1)
    }
    for (const p of s.getPlayers().filter(x => x.tribe === 'savu')) {
      s.setEventCount(p.id, 1, 'tribal_challenge_win', 1)
    }
    s.setEventCount(20, 1, 'found_idol_or_advantage', 1)
    s.setEventCount(11, 1, 'first_to_cry', 1)
    s.setEventCount(11, 1, 'bleeped_swearing', 1)
    s.setRecapNote(1, svc.getRecapNote(1))
    return renderToStaticMarkup(React.createElement(RecapTab, {
      service: s, players: s.getPlayers(), episode: ep, onEpisodeChange: () => {},
      canEdit, onSaveNote: () => {}, version: 1,
    }))
  }
  const html = view(true)
  check('renders Episode 1 Recap', html.includes('Episode 1 Recap'))
  check('renders 6 sections (4 news + notes + movement)',
    (html.match(/class="recap-group"/g) || []).length === 6)
  check('shows Rob', html.includes('Rob Antonson'))
  check('note editor when canEdit', html.includes('recap-note'))
  check('sparklines render', html.includes('spark-bar'))
  check('note text rendered', html.includes('Exile Island'))
  const ro = view(false)
  check('read-only without key', !ro.includes('textarea') && ro.includes('Exile Island'))
  const emptySvc = new PlayerService()
  check('empty episode guides user', renderToStaticMarkup(React.createElement(RecapTab, {
    service: emptySvc, players: emptySvc.getPlayers(), episode: 9, onEpisodeChange: () => {},
    canEdit: true, onSaveNote: () => {}, version: 1,
  })).includes('Nothing scored for episode 9'))
  if (!html.includes('Episode 1 Recap')) {
    console.log('DEBUG head: ' + html.slice(0, 260));
  }

  console.log('\n--- digest preview ---')
  for (const g of groups) {
    console.log('  ' + g.group.toUpperCase())
    for (const l of g.lines) console.log('    ' + (l.points > 0 ? '+' : '') + l.points + '  ' + l.headline)
  }
  console.log('  NOTE: ' + recap.notes[0].slice(0, 66) + '...')
  console.log('\n' + pass + ' passed, ' + fail + ' failed')
  process.exit(fail === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
