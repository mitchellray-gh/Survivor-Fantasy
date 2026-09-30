// Seeds Episode 1 from the commissioner's narrative via the live API.
const BASE = 'https://survivor-fantasy-six.vercel.app';
const KEY = 'survive';

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + await r.text());
  return r.json();
}

async function main() {
  const state = await (await fetch(BASE + '/api/state')).json();
  const players = state.players;

  // Survival +2 to everyone except Aaliyah, who was voted out.
  for (const p of players) {
    if (p.name.startsWith('Aaliyah')) continue;
    await post('/api/events', {
      playerId: p.id, episode: 1, categoryId: 'survived_tribal', count: 1,
    });
  }
  // Savu wins the opening challenge.
  const savu = players.filter(p => p.tribe_id === 'savu');
  for (const p of savu) {
    await post('/api/events', {
      playerId: p.id, episode: 1, categoryId: 'tribal_challenge_win', count: 1,
    });
  }
  // Rob finds the idol.
  const rob = players.find(p => p.name.startsWith('Rob'));
  await post('/api/events', { playerId: rob.id, episode: 1, categoryId: 'found_idol_or_advantage', count: 1 });
  // Eric cries first (+2) and gets bleeped (+1).
  const eric = players.find(p => p.name.startsWith('Eric'));
  await post('/api/events', { playerId: eric.id, episode: 1, categoryId: 'first_to_cry', count: 1 });
  await post('/api/events', { playerId: eric.id, episode: 1, categoryId: 'bleeped_swearing', count: 1 });

  // Aaliyah voted out.
  const aaliyah = players.find(p => p.name.startsWith('Aaliyah'));
  await post('/api/players', { id: aaliyah.id, status: 'voted_out' });

  // Near-misses and colour.
  await post('/api/meta', {
    key: 'recap_note_ep1',
    value: 'Lewis failed to retrieve the idol on Exile Island, and both Jenna and '
         + 'Aaliyah pulled "Not Safe" on their Shot in the Dark attempts.',
  });

  const after = await (await fetch(BASE + '/api/state')).json();
  console.log('events seeded  :', after.events.length);
  console.log('Aaliyah status :', after.players.find(p => p.id === aaliyah.id).status);
  console.log('recap note     :', (after.meta.recap_note_ep1 || '').slice(0, 60) + '...');
  console.log('Rob total      :', after.events
    .filter(e => e.playerId === rob.id)
    .reduce((s, e) => s + (e.categoryId === 'survived_tribal' ? 2
      : e.categoryId === 'tribal_challenge_win' ? 2
      : e.categoryId === 'found_idol_or_advantage' ? 4 : 0), 0), '(expect 8)');
  console.log('Eric total     :', after.events
    .filter(e => e.playerId === eric.id)
    .reduce((s, e) => s + (e.categoryId === 'survived_tribal' ? 2
      : e.categoryId === 'tribal_challenge_win' ? 2
      : e.categoryId === 'first_to_cry' ? 2
      : e.categoryId === 'bleeped_swearing' ? 1 : 0), 0), '(expect 7)');
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
