// Invariants: things that must never happen, whatever the balance.
// node sim/check.js
import { init, step, play } from './model.js';
import { STARTS } from './data.js';
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL', m); };
// determinism: same seed, same story
for (const road of ['wealth', 'military']) {
  const a = play(42, { difficulty: 'legate', road, start: 'GSU' }), b = play(42, { difficulty: 'legate', road, start: 'GSU' });
  if (JSON.stringify(a.outcome) !== JSON.stringify(b.outcome) || JSON.stringify(a.stats) !== JSON.stringify(b.stats)) fail(`not deterministic (${road})`);
}
// per-turn impossibilities across a spread of runs
let runs = 0;
for (const d of ['legionary', 'legate']) for (const road of ['wealth', 'military', 'politics', 'charisma']) for (const start of STARTS) for (let i = 0; i < 3; i++) {
  const s = init(1000 + i, { difficulty: d, road, start });
  runs++;
  while (!s.outcome && s.turn < 64) {
    step(s);
    for (const l of Object.values(s.legions)) {
      if (!(l.men >= 1000)) fail(`legion ${l.id} with ${l.men} men survived the cull`);
      if (!s.factions[l.owner]) fail(`legion ${l.id} owned by unknown ${l.owner}`);
      if (!Number.isFinite(l.loyalty) || l.loyalty < 0 || l.loyalty > 100) fail(`legion ${l.id} loyalty ${l.loyalty}`);
      if (l.army && !s.armies[l.army]?.legions.includes(l.id)) fail(`legion ${l.id} points at army ${l.army} that does not hold it`);
    }
    for (const A of Object.values(s.armies)) for (const id of A.legions) if (s.legions[id]?.army !== A.id) fail(`army ${A.id} holds ${id} which points elsewhere`);
    for (const F of Object.values(s.factions)) if (!Number.isFinite(F.treasury) || !Number.isFinite(F.legit)) fail(`faction ${F.id} non-finite money or legitimacy`);
    if (s.emperor && !s.factions[s.emperor]?.alive) fail(`emperor ${s.emperor} is dead`);
    if (fails > 10) process.exit(1);
  }
  if (!s.outcome) fail(`run did not finish (${d} ${road} ${start})`);
  const hist = Object.values(s.factions).filter((f) => f.kind === 'hist').map((f) => f.id);
  if (s.turn > 17 && !['galba', 'otho', 'vitellius', 'vespasian'].every((h) => hist.includes(h))) fail(`a historical claimant never appeared (${hist})`);
  if (s.turn > 17 && Object.values(s.factions).some((f) => f.alive && (f.kind === 'minor' || f.kind === 'proc'))) fail(`a non-historical rival survived into Act IV (${d} ${road} ${start})`);
}
console.log(fails ? `${fails} failures` : `ok: ${runs} runs, invariants held every turn`);
process.exit(fails ? 1 : 0);
