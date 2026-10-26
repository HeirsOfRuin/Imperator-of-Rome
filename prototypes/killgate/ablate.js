// Option ablation: remove one encounter option from the player's bot and
// compare win rate on the same seeds. node sim/ablate.js [runs] [difficulty]
import { batch } from './run.js';
import { STARTS } from './data.js';
import { noiseFloor } from './stats.js';
const runs = Number(process.argv[2] || 20), d = process.argv[3] || 'centurion';
const OPTS = ['buy', 'negotiate', 'fight', 'bypass'];
for (const road of ['wealth', 'military', 'politics', 'charisma']) {
  const base = batch(d, road, STARTS, runs);
  const pb = base.filter((r) => r.win).length / base.length;
  const line = [`${road.padEnd(9)} base ${(100 * pb).toFixed(1)}%`];
  for (const o of OPTS) {
    const v = batch(d, road, STARTS, runs, { allowed: OPTS.filter((x) => x !== o) });
    const pv = v.filter((r) => r.win).length / v.length;
    const gap = 100 * (pv - pb), fl = noiseFloor(pb, base.length, pv, v.length);
    line.push(`no-${o} ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}${Math.abs(gap) < fl ? '~' : ''}`);
  }
  for (const o of OPTS) {
    const v = batch(d, road, STARTS, runs, { allowed: [o] });
    line.push(`only-${o} ${(100 * v.filter((r) => r.win).length / v.length).toFixed(1)}%`);
  }
  console.log(line.join('  '));
}
console.log(`(~ = within noise floor; ${runs * STARTS.length} runs per cell)`);
