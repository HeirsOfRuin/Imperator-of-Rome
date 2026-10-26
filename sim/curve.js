// A table of one metric over two dimensions: does choosing well matter, and is
// knowing worth paying for? Copy to sim/curve.js. Config in sim/curves/:
//
//   // sim/curves/joust.js  (generalised from The Lists' joust-curve.js)
//   export default {
//     runs: 2000, metric: 'win',
//     rows: { 'squire\'s call': { policy: 'call' }, random: { policy: 'random' }, 'always shield': { policy: 'shield' } },
//     cols: { 'gap -4': { gap: -4 }, even: { gap: 0 }, 'gap +4': { gap: 4 } },
//     fixed: {},
//     adapter: 'sim/adapter-joust.js',   // optional: a second adapter for a sub-game
//   };
//   node sim/curve.js sim/curves/joust.js [--json=out/joust.json]
//
// Every cell is a rate with ±1 SE. Read rows against each other: if the best
// policy does not beat random by more than the floor, the choice is decoration;
// if a "read" of the opponent does not beat playing blind, the information has
// no value because it cannot change the choice (The Lists' first tuning).

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, loadAdapter, playFn, runCases, aggregate, fmt, writeJson, reportFailures } from './measure-lib.js';
import { noiseFloor } from './stats.js';

const args = parseArgs();
const file = args._[0];
if (!file) { console.error('usage: node sim/curve.js sim/curves/<name>.js [--runs=N] [--json=path]'); process.exit(2); }
const cfg = (await import(pathToFileURL(resolve(file)).href)).default;
const adapter = await loadAdapter(args.adapter || cfg.adapter || 'sim/adapter.js');
const play = playFn(adapter);
const runs = Number(args.runs || cfg.runs || 400);
const seed0 = Number(args.seed0 || cfg.seed0 || 1);
const metric = args.metric || cfg.metric || 'win';
const t0 = Date.now();

const table = {};
let clean = true;
for (const [rName, rOpts] of Object.entries(cfg.rows)) {
  table[rName] = {};
  for (const [cName, cOpts] of Object.entries(cfg.cols)) {
    // same seeds in every cell, so rows are compared on identical games
    const cases = Array.from({ length: runs }, (_, i) => ({ seed: seed0 + i * 7919, opts: { ...(adapter.defaults || {}), ...(cfg.fixed || {}), ...rOpts, ...cOpts } }));
    const res = runCases(adapter, cases, { play });
    clean = reportFailures(res, `${rName} / ${cName}: `) && clean;
    table[rName][cName] = aggregate(res.rows)[metric];
  }
}

const cols = Object.keys(cfg.cols);
const w = Math.max(10, ...Object.keys(cfg.rows).map((r) => r.length));
console.log(`\n${metric}, ${runs} runs per cell, ±1 SE, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`${''.padEnd(w)}  ${cols.map((c) => c.padStart(16)).join('')}`);
for (const [r, row] of Object.entries(table)) console.log(`${r.padEnd(w)}  ${cols.map((c) => fmt(row[c]).padStart(16)).join('')}`);
const any = Object.values(table)[0]?.[cols[0]];
if (any?.type === 'rate') console.log(`Two cells differ when the gap exceeds ~${noiseFloor(any.p, any.n).toFixed(1)} pts.`);

if (args.json) writeJson(args.json, { tool: 'curve', config: file, runs, metric, rows: Object.keys(cfg.rows), cols, table });
if (!clean && !args['allow-stalled']) process.exit(1);
