// Does every difference the game CLAIMS actually exist? Copy to sim/verify-claims.js.
//
// Difficulty blurbs, background descriptions, tooltips and store copy make
// claims ("Legate is harder", "the March gives a better horse"). Each claim is
// a pair of option sets and an expected direction; this plays both on the same
// seeds and says OK, ~ (within noise) or NO. A claim that cannot be shown
// should come out of the copy rather than stay as a promise (Centennial Farm
// withdrew two; Silk Road's hard level listed terrains that could not close).
//
//   // sim/claims.js
//   export default {
//     runs: 100, pool: ['start'],
//     claims: [
//       { text: 'Legate is harder than Centurion', metric: 'win',
//         a: { difficulty: 'centurion' }, b: { difficulty: 'legate' }, expect: '<' },
//       { text: 'The charisma road is viable', metric: 'win',
//         a: { road: 'military' }, b: { road: 'charisma' }, expect: '~' },
//     ],
//   };
//   node sim/verify-claims.js sim/claims.js [--json=out/claims.json]
//
// expect: '>' b higher than a · '<' b lower · '~' no real difference.
// Exits 1 when any claim is NO.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, loadAdapter, playFn, makeCells, makeCases, runCases, aggregate, gapOf, fmt, writeJson, reportFailures } from './measure-lib.js';
import { paired } from './stats.js';

const args = parseArgs();
const file = args._[0] || 'sim/claims.js';
const cfg = (await import(pathToFileURL(resolve(file)).href)).default;
const adapter = await loadAdapter(args.adapter || cfg.adapter || 'sim/adapter.js');
const play = playFn(adapter);
const runs = Number(args.runs || cfg.runs || 100);
const seed0 = Number(args.seed0 || cfg.seed0 || 1);
const pool = (cfg.pool || []).join(',');

const results = [];
let no = 0, clean = true;
for (const c of cfg.claims) {
  const metric = c.metric || 'win';
  const side = (opts) => {
    const [cell] = makeCells(adapter, { pool, opts: { ...(cfg.fixed || {}), ...opts } });
    const res = runCases(adapter, makeCases(adapter, cell, { runs, seed0 }), { play });
    clean = reportFailures(res, `${c.text}: `) && clean;
    return res;
  };
  const A = side(c.a), B = side(c.b);
  const a = aggregate(A.rows)[metric], b = aggregate(B.rows)[metric];
  let gap, real;
  if (a.type === 'rate') ({ gap, real } = gapOf(a, b));
  else {
    const byI = new Map(A.rows.map((r) => [r.i, r.metrics[metric]]));
    const pr = paired(B.rows.map((r) => byI.get(r.i)), B.rows.map((r) => r.metrics[metric]));
    gap = pr.diff; real = pr.real;
  }
  const dir = gap > 0 ? '>' : '<';
  const verdict = c.expect === '~' ? (real ? 'NO' : 'OK') : !real ? '~' : dir === c.expect ? 'OK' : 'NO';
  if (verdict === 'NO') no++;
  results.push({ text: c.text, metric, expect: c.expect, a, b, gap, real, verdict });
  console.log(`${verdict.padEnd(3)} ${c.text}\n     ${metric}: ${fmt(a)}  ->  ${fmt(b)}  (${gap >= 0 ? '+' : ''}${gap.toFixed(a.type === 'rate' ? 1 : 2)}${real ? '' : ', within noise'}; expected ${c.expect})`);
}
console.log(`\n${results.filter((r) => r.verdict === 'OK').length} OK, ${results.filter((r) => r.verdict === '~').length} within noise, ${no} NO; ${runs} runs per side`);
if (args.json) writeJson(args.json, { tool: 'verify-claims', config: file, runs, claims: results });
if (no || (!clean && !args['allow-stalled'])) process.exit(1);
