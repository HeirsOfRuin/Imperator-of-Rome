// The one statistics module for every measurement tool. Copy to sim/stats.js.
//
// Before this, five games computed the noise floor five ways (3 runs' worth,
// 2 SE, paired SD, inline 4.5-sigma bands), so numbers were not comparable
// between games or sessions. The rule everywhere now: a gap is a result when it
// exceeds 2 standard errors of the difference (about 95%).
//
// Why every number carries its floor and a distribution:
//  - The Company read 21.4% then 11.4% win on the same build at 70 runs.
//  - Centennial Farm's 60-run ablation read a helpful subsystem as harmful.
//  - Touchline's season-mean fitness (96.4) hid the one exhausted starter.
//  - Centennial Farm's mean net worth averaged survivors with foreclosures.

/** Standard error of a proportion p (0..1) over n runs, in percentage points. */
export function seRate(p, n) {
  if (!(n > 0)) return Infinity;
  return 100 * Math.sqrt(Math.max(p * (1 - p), 1 / n) / n);
}

/** Points a gap between two rates must exceed to count: 2 SE of the difference. */
export function noiseFloor(p1, n1, p2 = p1, n2 = n1) {
  return 2 * Math.sqrt(seRate(p1, n1) ** 2 + seRate(p2, n2) ** 2);
}

/** Runs per arm to resolve a gap of `points` at rate p (2 SE, two equal arms). */
export function runsFor(points, p = 0.5) {
  const d = points / 100;
  return Math.ceil((8 * Math.max(p * (1 - p), 0.0025)) / (d * d));
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export const median = (values) => quantile([...values].filter(Number.isFinite).sort((a, b) => a - b), 0.5);

/** Mean, median, p10, p90, min, max, sd; non-finite values are counted as `bad` (they are bugs). */
export function summarize(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const bad = values.filter((x) => x !== null && x !== undefined && !Number.isFinite(x)).length;
  const n = v.length;
  const mean = n ? v.reduce((a, b) => a + b, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, bad, mean, sd, se: n ? sd / Math.sqrt(n) : NaN, median: quantile(v, 0.5),
    p10: quantile(v, 0.1), p90: quantile(v, 0.9), min: v[0], max: v[n - 1] };
}

/** "12.3% ±1.4" — a rate with 1 SE. */
export function pct(k, n) {
  const p = n ? k / n : 0;
  return `${(100 * p).toFixed(1)}% ±${seRate(p, n).toFixed(1)}`;
}

/**
 * Paired comparison on the same seeds: mean difference b - a with its SE.
 * Pairing removes seed-to-seed variance, so it resolves smaller effects than
 * two independent arms (The Lists' verify-backgrounds).
 */
export function paired(a, b) {
  const d = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = Number(a[i]), y = Number(b[i]);
    if (Number.isFinite(x) && Number.isFinite(y)) d.push(y - x);
  }
  const s = summarize(d);
  return { n: s.n, diff: s.mean, se: s.se, real: Math.abs(s.mean) > 2 * s.se };
}

/**
 * Shares of a total. Assert composition, not magnitude, for compounding
 * systems: share bands survive a rebalance; magnitude asserts get deleted.
 */
export function shares(parts) {
  const total = Object.values(parts).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.max(0, v) / total]));
}
