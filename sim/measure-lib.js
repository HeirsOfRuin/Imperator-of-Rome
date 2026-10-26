// Shared core of run.js, ablate.js, curve.js and verify-claims.js. Copy to sim/.
//
// Everything game-specific lives in ONE file, sim/adapter.js (see
// templates/adapter.js). This library turns it into cells, seeded cases, batches
// that refuse runs which did not progress, aggregates with standard errors, and
// JSON that report.mjs turns into the Markdown for DESIGN.md.
//
// Seven runners and nine ablation loops were written across nine games, each
// re-implementing argument parsing, seeding, progress checks and the noise
// floor slightly differently. This is the one version.

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { seRate, noiseFloor, summarize } from './stats.js';

// ---------------------------------------------------------------- arguments

/** --k=v, --flag, positional. --opts='{"x":1}' is parsed as JSON. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) { out._.push(a); continue; }
    const [, k, v] = m;
    if (v === undefined) out[k] = true;
    else if (k === 'opts') out[k] = JSON.parse(v);
    else if (/^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

const list = (v) => (v === undefined || v === true ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));

// ---------------------------------------------------------------- adapter

/** Load sim/adapter.js (or --adapter=path) and check it has what the tools need. */
export async function loadAdapter(path = 'sim/adapter.js') {
  const mod = await import(pathToFileURL(resolve(path)).href);
  const missing = [];
  if (!mod.play && !(mod.newGame && mod.step && mod.done && mod.clock)) missing.push('play(seed, opts)  or  newGame/step/done/clock');
  if (!mod.progress) missing.push('progress(state) -> string[]');
  if (!mod.metrics) missing.push('metrics(state) -> { name: number|boolean }');
  if (missing.length) throw new Error(`${path} is missing: ${missing.join('; ')}`);
  return mod;
}

export class Stall extends Error {}

/**
 * A play(seed, opts) function. If the adapter exports newGame/step/done/clock
 * instead, the loop is run here and the clock must strictly increase on every
 * step: a step that does not advance the game is a softlock, and is reported
 * as one rather than looping forever (Vikingr's hoard in/out loop).
 */
export function playFn(adapter, { maxSteps = 100000 } = {}) {
  if (adapter.play) return adapter.play;
  return (seed, opts) => {
    let s = adapter.newGame(seed, opts);
    let last = adapter.clock(s);
    for (let i = 0; !adapter.done(s); i++) {
      if (i >= maxSteps) throw new Stall(`no ending after ${maxSteps} steps (clock ${last})`);
      s = adapter.step(s, opts) ?? s;
      const c = adapter.clock(s);
      if (!(c > last)) throw new Stall(`clock did not advance at step ${i}: ${last} -> ${c}`);
      last = c;
    }
    return s;
  };
}

// ---------------------------------------------------------------- cells and seeds

const cartesian = (axes) => axes.reduce((acc, [name, values]) =>
  acc.flatMap((o) => values.map((v) => ({ ...o, [name]: v }))), [{}]);

function axisValues(adapter, name, given) {
  const fromFlag = list(given);
  if (fromFlag.length) return fromFlag;
  const vals = adapter.axes?.[name];
  if (!vals?.length) throw new Error(`axis "${name}" has no values: add it to axes in the adapter or pass --${name}=a,b`);
  return vals;
}

/**
 * The cells of a measurement: one per combination of the --by axes.
 * Axes in --pool are spread across the runs of every cell (e.g. every start).
 * Any other --axis=value is fixed for all cells.
 */
export function makeCells(adapter, args, extra = {}) {
  let by = list(args.by);
  let pool = list(args.pool);
  const fixed = { ...(adapter.defaults || {}) };
  for (const name of Object.keys(adapter.axes || {})) {
    if (!by.includes(name) && !pool.includes(name) && args[name] !== undefined && args[name] !== true) fixed[name] = args[name];
  }
  Object.assign(fixed, args.opts || {}, extra);
  // An axis the options fix is not pooled or crossed: { road: 'military' }
  // must mean military only, not every road (found by verify-claims, when two
  // claim sides on different roads both played all four).
  const isFixed = (a) => Object.prototype.hasOwnProperty.call(args.opts || {}, a) || Object.prototype.hasOwnProperty.call(extra, a);
  by = by.filter((a) => !isFixed(a));
  pool = pool.filter((a) => !isFixed(a));
  const combos = cartesian(by.map((a) => [a, axisValues(adapter, a, args[a])]));
  const pooled = cartesian(pool.map((a) => [a, axisValues(adapter, a, args[a])]));
  return combos.map((c) => ({
    label: by.map((a) => c[a]).join(' / ') || 'all',
    opts: { ...fixed, ...c },
    pooled,
  }));
}

function hashMod(s, m = 1000) {
  return parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16) % m;
}

/** Seeded cases for one cell. adapter.seedFor(i, opts) overrides the scheme. */
export function makeCases(adapter, cell, { runs = 50, seed0 = 1 } = {}) {
  const out = [];
  for (const p of cell.pooled) {
    const opts = { ...cell.opts, ...p };
    for (let i = 0; i < runs; i++) {
      const seed = adapter.seedFor ? adapter.seedFor(i, opts, seed0) : seed0 + i * 7919 + hashMod(JSON.stringify(p));
      out.push({ seed, opts });
    }
  }
  return out;
}

// ---------------------------------------------------------------- batches

/**
 * Play every case. A run whose progress() names anything missing is STALLED
 * and excluded from the numbers; a throw is CRASHED. Both are listed, because
 * a batch that silently drops them reports on games nobody played (Cradle,
 * Centennial Farm).
 */
export function runCases(adapter, cases, { play = playFn(adapter), keepState = false, onChunk, chunk = 50 } = {}) {
  const rows = [], stalled = [], crashed = [];
  cases.forEach((c, i) => {
    let s;
    try { s = play(c.seed, c.opts); } catch (e) {
      (e instanceof Stall ? stalled : crashed).push({ ...c, why: e.message });
      return;
    }
    const missing = adapter.progress(s) || [];
    if (missing.length) { stalled.push({ ...c, why: missing.join('; ') }); return; }
    const row = { i, seed: c.seed, opts: c.opts, metrics: adapter.metrics(s, c.opts) };
    if (adapter.digest) row.digest = createHash('sha1').update(String(adapter.digest(s))).digest('hex');
    if (keepState) row.state = s;
    rows.push(row);
    if (onChunk && (i + 1) % chunk === 0) onChunk(i + 1, cases.length);
  });
  return { rows, stalled, crashed };
}

/** Metric name -> { type:'rate', k, n, p, se } | { type:'num', median, p10, p90, mean, ... }. */
export function aggregate(rows) {
  const names = [];
  for (const r of rows) for (const k of Object.keys(r.metrics)) if (!names.includes(k)) names.push(k);
  const out = {};
  for (const name of names) {
    const vals = rows.map((r) => r.metrics[name]).filter((v) => v !== undefined);
    if (vals.length && vals.every((v) => typeof v === 'boolean')) {
      const k = vals.filter(Boolean).length, n = vals.length;
      out[name] = { type: 'rate', k, n, p: k / n, se: seRate(k / n, n) };
    } else {
      out[name] = { type: 'num', ...summarize(vals.map(Number)) };
    }
  }
  return out;
}

/** Gap between two rates in points, with the 2-SE floor. */
export function gapOf(a, b) {
  const gap = 100 * (b.p - a.p);
  const floor = noiseFloor(a.p, a.n, b.p, b.n);
  return { gap, floor, real: Math.abs(gap) >= floor };
}

export function fmt(m) {
  if (!m) return '—';
  if (m.type === 'rate') return `${(100 * m.p).toFixed(1)}% ±${m.se.toFixed(1)}`;
  const f = (x) => (!Number.isFinite(x) ? '—' : Math.abs(x) >= 100 ? Math.round(x).toString() : x.toFixed(1));
  return `${f(m.median)} [${f(m.p10)}–${f(m.p90)}]${m.bad ? ` !!${m.bad} NaN` : ''}`;
}

export function fmtGap(g) {
  return `${g.gap >= 0 ? '+' : ''}${g.gap.toFixed(1)}${g.real ? '' : '~'}`;
}

// ---------------------------------------------------------------- output

export function gitHash() {
  try { return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}

/** Write a result for report.mjs. Rows are dropped; aggregates and failures are kept. */
export function writeJson(path, result) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify({ date: new Date().toISOString().slice(0, 10), git: gitHash(), argv: process.argv.slice(2), ...result }, null, 2));
  console.log(`wrote ${path}`);
}

/** Print stalled/crashed lists; return true when the batch is clean. */
export function reportFailures({ stalled, crashed }, label = '') {
  if (crashed.length) {
    console.log(`!! ${label}${crashed.length} crashed (a rare branch: run soak volume):`);
    for (const c of crashed.slice(0, 5)) console.log(`   seed ${c.seed} ${JSON.stringify(c.opts)}: ${c.why}`);
  }
  if (stalled.length) {
    console.log(`!! ${label}${stalled.length} did not progress, excluded from the numbers:`);
    for (const c of stalled.slice(0, 5)) console.log(`   seed ${c.seed} ${JSON.stringify(c.opts)}: ${c.why}`);
  }
  return !stalled.length && !crashed.length;
}
