import { PROVINCES, EDGES } from '../data/world.js';

export const ADJ = {};
for (const p of PROVINCES) ADJ[p.id] = [];
for (const [a, b, m, kind] of EDGES) {
  ADJ[a].push({ to: b, m, kind });
  ADJ[b].push({ to: a, m, kind });
}

export const PROV = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));

export const ITALY = ['NIT', 'ETR', 'ROM', 'CMP'];

export const isWinter = (turn) => { const m = (2 + turn) % 12; return m >= 10 || m <= 1; };

export function edgeCost(e, winter) { return e.m + (winter && e.kind !== 'land' ? 1 : 0); }

// Dijkstra; returns { dist, prev }
export const PATH_CACHE = new Map();

export function paths(from, winter) {
  const key = from + (winter ? 'w' : 's');
  if (PATH_CACHE.has(key)) return PATH_CACHE.get(key);
  const dist = { [from]: 0 }, prev = {}, done = new Set();
  while (true) {
    let u = null, best = Infinity;
    for (const k in dist) if (!done.has(k) && dist[k] < best) { best = dist[k]; u = k; }
    if (u === null) break;
    done.add(u);
    for (const e of ADJ[u]) {
      const d = best + edgeCost(e, winter);
      if (d < (dist[e.to] ?? Infinity)) { dist[e.to] = d; prev[e.to] = u; }
    }
  }
  const r = { dist, prev };
  PATH_CACHE.set(key, r);
  return r;
}

export function distance(a, b, winter = false) { return paths(a, winter).dist[b] ?? 99; }

export function route(a, b, winter) {
  const { prev } = paths(a, winter);
  const out = [];
  let c = b;
  while (c && c !== a) { out.unshift(c); c = prev[c]; }
  return c === a ? out : [];
}
