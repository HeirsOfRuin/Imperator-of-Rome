// Measurement helpers for balance harnesses. Copy into sim/ or tools/.
//
// Every number a harness prints should carry its noise floor, and every claim
// should be a distribution, not just a mean. Both rules come from mistakes:
//   - The Company read 21.4% then 11.4% win on the same build at 70 runs.
//   - Farmyard's 60-run ablation read a helpful subsystem as harmful.
//   - Touchline's mean starter fitness (96.4) hid the one exhausted man a
//     manager actually notices; the worst-starter distribution showed it.
//   - Farmyard's mean net worth averaged surviving farms with foreclosed ones
//     and described neither.

/** Standard error of a proportion p (0..1) over n runs, in percentage points. */
export function seRate(p, n) {
  if (!(n > 0)) return Infinity;
  return 100 * Math.sqrt(Math.max(p * (1 - p), 1 / n) / n);
}

/** Gap (points) two rates need before it is a result: 2 SE of the difference. */
export function noiseFloor(p1, n1, p2 = p1, n2 = n1) {
  return 2 * Math.sqrt(seRate(p1, n1) ** 2 + seRate(p2, n2) ** 2);
}

/** Runs needed to resolve a gap of `points` at rate p (2 SE, two equal arms). */
export function runsFor(points, p = 0.5) {
  const d = points / 100;
  return Math.ceil((8 * p * (1 - p)) / (d * d));
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Mean, median, p10, p90, min, max. Use for anything a player feels at the tails. */
export function summarize(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const bad = values.length - v.length; // NaN/Infinity are bugs: report them
  const mean = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  return {
    n: v.length, bad, mean, median: quantile(v, 0.5),
    p10: quantile(v, 0.1), p90: quantile(v, 0.9), min: v[0], max: v[v.length - 1],
  };
}

/**
 * Compare a variant against a baseline on several axes at once.
 * rows: [{ label, base: number[]|bool[], variant: number[]|bool[] }]
 * Booleans are treated as rates; numbers are summarized by median.
 * Reading one axis alone is how "never buy a machine" looked like the winning
 * play in Farmyard; three axes showed it was a risk-for-reward trade.
 */
export function compare(rows) {
  const out = [];
  for (const r of rows) {
    if (typeof r.base[0] === 'boolean') {
      const n1 = r.base.length, n2 = r.variant.length;
      const p1 = r.base.filter(Boolean).length / n1, p2 = r.variant.filter(Boolean).length / n2;
      const gap = 100 * (p2 - p1), floor = noiseFloor(p1, n1, p2, n2);
      out.push(`${r.label.padEnd(32)} ${(100 * p1).toFixed(1).padStart(6)}% ${(100 * p2).toFixed(1).padStart(6)}%  ` +
        `${gap >= 0 ? '+' : ''}${gap.toFixed(1).padStart(5)}  floor ${floor.toFixed(1)}  ${Math.abs(gap) < floor ? 'NOISE' : 'REAL'}`);
    } else {
      const a = summarize(r.base), b = summarize(r.variant);
      out.push(`${r.label.padEnd(32)} ${fmt(a.median).padStart(7)} ${fmt(b.median).padStart(7)}  ` +
        `p10 ${fmt(a.p10)}->${fmt(b.p10)}  p90 ${fmt(a.p90)}->${fmt(b.p90)}${a.bad + b.bad ? `  !! ${a.bad + b.bad} non-finite` : ''}`);
    }
  }
  return out.join('\n');
}

function fmt(x) {
  if (!Number.isFinite(x)) return String(x);
  return Math.abs(x) >= 100 ? Math.round(x).toString() : x.toFixed(2);
}

/**
 * Share-of-total check for compounding systems (failure mode: no owner for a
 * product of multipliers). Assert composition, not magnitude: magnitude
 * assertions get deleted on every rebalance, share bands survive it.
 *   shares({ contracts: 7300, plunder: 300, raids: 120 }) -> { contracts: 0.945, ... }
 */
export function shares(parts) {
  const total = Object.values(parts).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.max(0, v) / total]));
}
