// Ablation: the same seeds with something switched off, against the baseline.
// Copy to sim/ablate.js. One config file per question, in sim/ablations/:
//
//   // sim/ablations/depth.js  (FRAME-DEPTH: does each system matter?)
//   export default {
//     runs: 10, by: ['road'], pool: ['start'], fixed: { difficulty: 'centurion' },
//     base: {},
//     variants: { noSenate: { noSenate: true }, noTrade: { noTrade: true } },
//     metrics: ['win', 'breaches'],  // tables printed; every metric goes to --json
//   };
//
//   node sim/ablate.js sim/ablations/depth.js [--runs=20] [--json=out/depth.json]
//
// Prints one table per metric: a row per cell (plus "all" when there are
// several), the base value, and each variant. Rates show the gap from base in
// points, marked ~ when inside the 2-SE floor; numbers show the variant's
// median and mean. Read the cells, not only the pool: an effect that cancels
// across cells is still an effect (Imperator's Senate: -15.7 on the wealth
// road, -1.4 overall).
//
// --inert (or `inert: true`) also compares each variant's end-state digest with
// the baseline on the same case. With a deterministic engine a switch the
// engine never reads gives byte-identical games: an exact test for decoration
// (Touchline's three dead tactics; every Imperator building). Needs digest().
//
// `cases: [{ seed, opts }]` replaces the matrix for a hand-picked set of games.
// `variants` may be a function (adapter) => object, e.g. one per building.
//
// An ablation LOCATES an effect; it does not ATTRIBUTE it. "No change" can mean
// decoration or a bot that never uses the thing. Check the bot before the design.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, loadAdapter, playFn, makeCells, makeCases, runCases, aggregate, gapOf, fmt, fmtGap, writeJson, reportFailures } from './measure-lib.js';

const args = parseArgs();
const file = args._[0];
if (!file) { console.error('usage: node sim/ablate.js sim/ablations/<question>.js [--runs=N] [--inert] [--json=path]'); process.exit(2); }
const cfg = (await import(pathToFileURL(resolve(file)).href)).default;
const adapter = await loadAdapter(args.adapter || cfg.adapter || 'sim/adapter.js');
const play = playFn(adapter);
const runs = Number(args.runs || cfg.runs || 20);
const seed0 = Number(args.seed0 || cfg.seed0 || 1);
const inert = !!(args.inert || cfg.inert);
if (inert && !adapter.digest) throw new Error('--inert needs digest(state) in the adapter: what an end state is, as a string');
const variants = typeof cfg.variants === 'function' ? cfg.variants(adapter) : cfg.variants;
const vnames = Object.keys(variants);

const cellArgs = { by: (cfg.by || []).join(','), pool: (cfg.pool || []).join(','), opts: { ...(cfg.fixed || {}), ...(cfg.base || {}) } };
const cells = cfg.cases ? [{ label: 'cases', opts: cfg.base || {}, pooled: [{}] }] : makeCells(adapter, cellArgs);
const casesFor = (cell, delta) => (cfg.cases
  ? cfg.cases.map((c) => ({ seed: c.seed, opts: { ...c.opts, ...(cfg.base || {}), ...delta } }))
  : makeCases(adapter, { ...cell, opts: { ...cell.opts, ...delta } }, { runs, seed0 }));

const t0 = Date.now();
let clean = true;
const result = { tool: 'ablate', config: file, runs, seed0, cells: [] };
const pooledRows = { base: [], ...Object.fromEntries(vnames.map((k) => [k, []])) };

function compare(baseAgg, vRows, baseRows) {
  const vAgg = aggregate(vRows);
  const gaps = {};
  for (const n of Object.keys(baseAgg)) if (baseAgg[n].type === 'rate' && vAgg[n]) gaps[n] = gapOf(baseAgg[n], vAgg[n]);
  let changed = null;
  if (inert) {
    const baseDigest = new Map(baseRows.map((r) => [r.i, r.digest]));
    changed = vRows.filter((r) => baseDigest.has(r.i) && r.digest !== baseDigest.get(r.i)).length;
  }
  return { n: vRows.length, metrics: vAgg, gaps, changed };
}

for (const cell of cells) {
  const base = runCases(adapter, casesFor(cell, {}), { play });
  clean = reportFailures(base, `${cell.label} base: `) && clean;
  pooledRows.base.push(...base.rows.map((r) => ({ ...r, i: `${cell.label}|${r.i}` })));
  const bAgg = aggregate(base.rows);
  const out = { label: cell.label, n: base.rows.length, base: bAgg, variants: {} };
  for (const name of vnames) {
    const v = runCases(adapter, casesFor(cell, variants[name]), { play });
    clean = reportFailures(v, `${cell.label} ${name}: `) && clean;
    pooledRows[name].push(...v.rows.map((r) => ({ ...r, i: `${cell.label}|${r.i}` })));
    out.variants[name] = compare(bAgg, v.rows, base.rows);
  }
  result.cells.push(out);
  process.stderr.write(`  ${cell.label} done\n`);
}
if (cells.length > 1) {
  const bAgg = aggregate(pooledRows.base);
  result.pooled = { label: 'all', n: pooledRows.base.length, base: bAgg, variants: {} };
  for (const name of vnames) result.pooled.variants[name] = compare(bAgg, pooledRows[name], pooledRows.base);
}

// ---- print: one table per metric
const rowsOut = result.pooled ? [...result.cells, result.pooled] : result.cells;
const metricNames = Object.keys(result.cells[0]?.base || {}).filter((k) => !cfg.metrics || cfg.metrics.includes(k));
const w = Math.max(6, ...rowsOut.map((r) => r.label.length));
const colW = Math.max(14, ...vnames.map((v) => v.length + 2));
const mean = (m) => (Number.isFinite(m?.mean) ? (Math.abs(m.mean) >= 100 ? Math.round(m.mean) : m.mean.toFixed(2)) : '—');
for (const metric of metricNames) {
  const isRate = result.cells[0].base[metric].type === 'rate';
  console.log(`\n${metric}${isRate ? ' — gap from base in points (~ within noise)' : ' — median (mean)'}`);
  console.log(`${'cell'.padEnd(w)}  ${'n'.padStart(5)}  ${'base'.padStart(16)}  ${vnames.map((v) => v.padStart(colW)).join('')}`);
  for (const r of rowsOut) {
    const baseCell = isRate ? fmt(r.base[metric]) : `${fmt(r.base[metric]).split(' ')[0]} (${mean(r.base[metric])})`;
    const vs = vnames.map((v) => {
      const x = r.variants[v];
      const s = isRate ? (x.gaps[metric] ? fmtGap(x.gaps[metric]) : '—') : `${fmt(x.metrics[metric]).split(' ')[0]} (${mean(x.metrics[metric])})`;
      return s.padStart(colW);
    });
    console.log(`${r.label.padEnd(w)}  ${String(r.n).padStart(5)}  ${baseCell.padStart(16)}  ${vs.join('')}`);
  }
}
if (inert) {
  console.log('\nend states changed against base (same cases)');
  for (const r of rowsOut) console.log(`${r.label.padEnd(w)}  ${vnames.map((v) => `${v} ${r.variants[v].changed}/${r.variants[v].n}${r.variants[v].changed ? '' : ' !! INERT'}`).join('  ')}`);
}
console.log(`\n${result.cells[0]?.n ?? 0} runs per cell, seed0 ${seed0}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (args.json) writeJson(args.json, result);
if (!clean && !args['allow-stalled']) process.exit(1);
