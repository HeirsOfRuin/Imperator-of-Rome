// What does each diplomatic tool add? Same seeds, one tool switched off for the
// player's bot. node tools/measure-diplomacy.js [runs per start] [difficulty]
import { batch } from './measure-campaign.js';
import { STARTS } from '../src/data/world.js';
import { noiseFloor } from './stats.js';
const runs = Number(process.argv[2] || 15), d = process.argv[3] || 'centurion';
const variants = { 'all diplomacy off': { noPlayerDiplomacy: true }, 'no truces/alliances': { dipOff: ['truce'] }, 'no submissions': { dipOff: ['submission', 'offers'] }, 'no client kings': { dipOff: ['clients'] }, 'no decree': { dipOff: ['decree'] } };
for (const road of ['wealth', 'military', 'politics', 'charisma']) {
  const base = batch(d, road, STARTS, runs), pb = base.filter((r) => r.win).length / base.length;
  const out = [`${road.padEnd(9)} base ${(100 * pb).toFixed(1)}%`];
  for (const [name, o] of Object.entries(variants)) {
    const v = batch(d, road, STARTS, runs, o), pv = v.filter((r) => r.win).length / v.length;
    const gap = 100 * (pv - pb), fl = noiseFloor(pb, base.length, pv, v.length);
    out.push(`${name} ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}${Math.abs(gap) < fl ? '~' : ''}`);
  }
  console.log(out.join('  '));
}
console.log(`(~ within noise; ${runs * STARTS.length} runs per cell, ${d})`);
