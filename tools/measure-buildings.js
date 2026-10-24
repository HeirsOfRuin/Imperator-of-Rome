// Is every building worth building somewhere? Counts what gets built, and for
// each building checks whether forbidding it changes any campaign's end state
// (same seeds; the engine is deterministic). A building that changes nothing
// is decoration. node tools/measure-buildings.js [runs per road]
import { play } from '../src/engine/turn.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { STARTS } from '../src/data/world.js';
const N = Number(process.argv[2] || 6);
const roads = ['wealth', 'military', 'politics', 'charisma'];
const runs = [];
for (const road of roads) for (let i = 0; i < N; i++) runs.push({ difficulty: 'centurion', road, start: STARTS[i % STARTS.length], seed: 300 + i * 13 });
const sig = (s) => JSON.stringify([s.outcome, s.stats.maxLegions, Math.round(s.factions.player.treasury), s.turn]);
const built = {}, playerBuilt = {};
const base = runs.map((o) => {
  const s = play(o.seed, o);
  for (const P of Object.values(s.prov)) for (const b of P.buildings || []) { built[b] = (built[b] || 0) + 1; if (P.owner === 'player') playerBuilt[b] = (playerBuilt[b] || 0) + 1; }
  return { sig: sig(s), win: s.outcome.win };
});
const wins0 = base.filter((x) => x.win).length;
console.log(`${runs.length} campaigns (centurion). Built by the end, all factions (player's provinces):`);
for (const id of Object.keys(BUILDINGS)) {
  let changed = 0, wins = 0;
  runs.forEach((o, i) => { const s = play(o.seed, { ...o, noBuilding: [id] }); if (sig(s) !== base[i].sig) changed++; if (s.outcome.win) wins++; });
  console.log(`  ${id.padEnd(9)} built ${String(built[id] || 0).padStart(4)} (${playerBuilt[id] || 0})   forbidding it changes ${changed}/${runs.length} campaigns${changed ? '' : '  !! INERT'}   wins ${wins0} -> ${wins}`);
}
const s0 = runs.map((o) => play(o.seed, { ...o, noBuildings: true }));
console.log(`no buildings at all: wins ${wins0} -> ${s0.filter((s) => s.outcome.win).length} of ${runs.length}`);
