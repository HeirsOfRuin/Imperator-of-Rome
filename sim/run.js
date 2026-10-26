// Batch runner. Copy to sim/run.js; the game plugs in through sim/adapter.js.
//
//   node sim/run.js --runs=50                       one cell, adapter defaults
//   node sim/run.js --runs=25 --by=difficulty,road --pool=start
//                                                   a matrix: a row per difficulty x road,
//                                                   every start pooled into each row
//   node sim/run.js --difficulty=legate --opts='{"noTrade":true}'
//   node sim/run.js --trace --seed=17               one game, the adapter's trace(state)
//   node sim/run.js ... --json=out/run.json         for report.mjs
//   node sim/run.js ... --metrics=win,turn          only these columns
//
// Exits 1 if any run stalled or crashed (--allow-stalled to report anyway): a
// batch that quietly drops games that never progressed is the Cradle bug.

import { parseArgs, loadAdapter, playFn, makeCells, makeCases, runCases, aggregate, fmt, writeJson, reportFailures } from './measure-lib.js';
import { runsFor } from './stats.js';

const args = parseArgs();
const adapter = await loadAdapter(args.adapter || 'sim/adapter.js');
const play = playFn(adapter, { maxSteps: args['max-steps'] || 100000 });

if (args.trace) {
  const seed = Number(args.seed ?? 1);
  const [cell] = makeCells(adapter, { ...args, by: undefined, pool: undefined });
  const s = play(seed, cell.opts);
  if (adapter.trace) console.log(adapter.trace(s, cell.opts));
  else console.log(JSON.stringify(adapter.metrics(s, cell.opts), null, 2));
  const missing = adapter.progress(s);
  console.log(missing.length ? `!! did not progress: ${missing.join('; ')}` : 'progressed');
  process.exit(missing.length ? 1 : 0);
}

const runs = Number(args.runs || 50);
const seed0 = Number(args.seed0 || 1);
const cells = makeCells(adapter, args);
const only = args.metrics && args.metrics !== true ? String(args.metrics).split(',') : null;
const t0 = Date.now();
const out = [];
let clean = true;

for (const cell of cells) {
  const cases = makeCases(adapter, cell, { runs, seed0 });
  const res = runCases(adapter, cases, {
    play,
    onChunk: cells.length === 1 ? (i, n) => process.stderr.write(`  ${i}/${n}\r`) : undefined,
  });
  clean = reportFailures(res, cells.length > 1 ? `${cell.label}: ` : '') && clean;
  const agg = aggregate(res.rows);
  out.push({ label: cell.label, opts: cell.opts, n: res.rows.length, stalled: res.stalled.length, crashed: res.crashed.length, metrics: agg });
}

const names = [...new Set(out.flatMap((c) => Object.keys(c.metrics)))].filter((k) => !only || only.includes(k));
const width = Math.max(8, ...out.map((c) => c.label.length));
console.log(`\n${runs} runs per cell${cells[0].pooled.length > 1 ? ` x ${cells[0].pooled.length} pooled` : ''}, seed0 ${seed0}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`${'cell'.padEnd(width)}  ${'n'.padStart(5)}  ${names.map((n) => n.padEnd(18)).join(' ')}`);
for (const c of out) console.log(`${c.label.padEnd(width)}  ${String(c.n).padStart(5)}  ${names.map((n) => fmt(c.metrics[n]).padEnd(18)).join(' ')}`);
const rates = out.flatMap((c) => Object.values(c.metrics).filter((m) => m.type === 'rate'));
if (rates.length) {
  const p = rates.reduce((a, m) => a + m.p, 0) / rates.length;
  console.log(`\nRates are ±1 SE. Two cells differ when the gap exceeds ~${(2 * Math.SQRT2 * rates[0].se).toFixed(1)} pts here; ${runsFor(2, p)} runs per cell resolve 2 pts.`);
}

if (args.json) writeJson(args.json, { tool: 'run', runs, seed0, cells: out });
if (!clean && !args['allow-stalled']) process.exit(1);
