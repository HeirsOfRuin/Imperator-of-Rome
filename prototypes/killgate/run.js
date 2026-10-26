// Kill-gate batch: node sim/run.js [runsPerCell] [difficulty|all]
// Prints win rate by road x difficulty (all starts pooled) with 1 SE, then
// the fight counts, loss causes and the other gate checks.
import { play } from './model.js';
import { STARTS } from './data.js';
import { seRate, summarize } from './stats.js';

const runs = Number(process.argv[2] || 70);
const diffs = process.argv[3] && process.argv[3] !== 'all' ? [process.argv[3]] : ['legionary', 'centurion', 'legate'];
const roads = ['wealth', 'military', 'politics', 'charisma'];
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : {};

export function batch(difficulty, road, starts, n, extraOpts = {}) {
  const rows = [];
  for (const start of starts) for (let i = 0; i < n; i++) {
    const seed = 1 + i * 7919 + start.charCodeAt(0) * 31 + start.charCodeAt(1);
    const s = play(seed, { difficulty, road, start, ...extraOpts });
    if (!s.outcome || !(s.turn >= 1)) throw new Error(`run did not finish (${difficulty} ${road} ${start} seed ${seed})`);
    if (s.outcome.win && !s.stats.tookRome) throw new Error(`win without Rome (${difficulty} ${road} ${start} seed ${seed})`);
    rows.push({ start, win: s.outcome.win, cause: s.outcome.cause, turn: s.outcome.turn, st: s.stats });
  }
  return rows;
}

const pct = (k, n) => `${(100 * k / n).toFixed(1)}% ±${seRate(k / n, n).toFixed(1)}`;

if (process.argv[1].endsWith('run.js')) {
  const t0 = Date.now();
  for (const d of diffs) {
    console.log(`\n=== ${d} (${runs} runs per start x ${STARTS.length} starts per road)`);
    const all = [];
    for (const road of roads) {
      const rows = batch(d, road, STARTS, runs, extra);
      all.push(...rows.map((r) => ({ ...r, road })));
      const w = rows.filter((r) => r.win).length;
      const small = summarize(rows.map((r) => r.st.pSmall)), large = summarize(rows.map((r) => r.st.pLarge));
      const winners = rows.filter((r) => r.win);
      const ws = summarize(winners.map((r) => r.st.pSmall)), wl = summarize(winners.map((r) => r.st.pLarge));
      console.log(`${road.padEnd(9)} win ${pct(w, rows.length).padEnd(13)} fights small med ${small.median} (winners ${ws.median ?? '-'}), large med ${large.median} (winners ${wl.median ?? '-'})  tookRome ${pct(rows.filter((r) => r.st.tookRome).length, rows.length)}  took-then-lost ${pct(rows.filter((r) => r.st.tookRome && !r.win).length, rows.length)}`);
    }
    const byStart = STARTS.map((st) => { const r = all.filter((x) => x.start === st); return `${st} ${(100 * r.filter((x) => x.win).length / r.length).toFixed(1)}%`; });
    console.log('by start  ' + byStart.join('  '));
    const causes = {};
    for (const r of all) causes[r.cause] = (causes[r.cause] || 0) + 1;
    console.log('outcomes  ' + Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / all.length).toFixed(0)}%`).join(', '));
    const anchor = all.filter((r) => r.st.histZeroBeforeIV > 0).length;
    console.log(`anchor    a historical claimant at zero legions before Act IV in ${pct(anchor, all.length)} of runs; procedural rivals per run median ${summarize(all.map((r) => r.st.procSpawned)).median}`);
    const gb = { buy: 0, negotiate: 0, fight: 0, letter: 0 };
    for (const r of all) for (const k in gb) gb[k] += r.st.gainedBy[k];
    const tot = Object.values(gb).reduce((a, b) => a + b, 0) || 1;
    console.log('gains by  ' + Object.entries(gb).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', ') + `  bypasses/run ${(all.reduce((a, r) => a + r.st.bypasses, 0) / all.length).toFixed(1)}`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
