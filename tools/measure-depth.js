// Depth systems (docs/FRAME-DEPTH.md): does each one matter? Plays the same
// campaigns with each system switched off and prints the win rate and what
// the system did. node tools/measure-depth.js [runsPerStart] [difficulty]
import { batch } from './measure-campaign.js';
import { STARTS } from '../src/data/world.js';
import { seRate } from './stats.js';

const runs = Number(process.argv[2] || 10);
const d = process.argv[3] || 'centurion';
const roads = ['wealth', 'military', 'politics', 'charisma'];
const variants = { all: {}, noSenate: { noSenate: true }, noForeign: { noForeign: true }, noTrade: { noTrade: true } };
const avg = (rows, f) => (rows.reduce((a, r) => a + (f(r) || 0), 0) / rows.length);
for (const [name, opts] of Object.entries(variants)) {
  const rows = [];
  for (const road of roads) rows.push(...batch(d, road, STARTS, runs, opts));
  const w = rows.filter((r) => r.win).length / rows.length;
  console.log(`${name.padEnd(10)} win ${(100 * w).toFixed(1)}% ±${seRate(w, rows.length).toFixed(1)}  motions ${avg(rows, (r) => r.st.motions).toFixed(1)}  outlawed you ${avg(rows, (r) => r.st.hostisOnYou).toFixed(2)}  outlawings ${avg(rows, (r) => r.st.hostisAll).toFixed(2)}  subsidies ${avg(rows, (r) => r.st.subsidiesAll).toFixed(1)}  incitements ${avg(rows, (r) => r.st.incitesAll).toFixed(2)}  trade share ${(100 * avg(rows, (r) => r.st.tradeIncome / Math.max(1, (r.st.tradeIncome || 0) + (r.st.taxIncome || 0)))).toFixed(1)}%  breaches ${avg(rows, (r) => r.st.breaches).toFixed(2)}`);
}
