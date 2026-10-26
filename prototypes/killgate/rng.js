// Deterministic RNG with named streams. Copy into src/engine/rng.js.
// Source: Centennial Farm (Farmyard-/src/engine/rng.js), reused unchanged by The Lists.
//
// Two rules make balance-by-simulation possible:
//   1. Generator state is one 32-bit integer, so it goes into the save. Reloading
//      cannot reroll a check.
//   2. Systems draw from NAMED STREAMS derived from (seed, period, label). Adding a
//      draw to the event system does not shift every weather roll, so two builds
//      can be compared on the same seed and an ablation can switch one subsystem
//      off without re-rolling the rest of the world.
//
// Never call Math.random() or Date.now() in the engine. Ids come from counters
// kept IN STATE, never module-level counters (a batch runner playing 60 games in
// one process gave the same seed different ids — Farmyard).

const UINT32 = 4294967296;

export function hashString(str) {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const raw = () => { // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
  return {
    next: raw,
    get state() { return state; },
    set state(v) { state = (v >>> 0) || 1; },
    int(n) { return n > 0 ? Math.floor(raw() * n) : 0; },
    range(lo, hi) { if (hi < lo) [lo, hi] = [hi, lo]; return lo + Math.floor(raw() * (hi - lo + 1)); },
    float(lo, hi) { return lo + raw() * (hi - lo); },
    chance(p) { return raw() < p; },
    pick(arr) { return arr && arr.length ? arr[Math.floor(raw() * arr.length)] : undefined; },
    // Returns undefined when nothing is selectable: callers must handle it.
    weighted(entries, key = 'weight') {
      let total = 0;
      for (const e of entries) if (e[key] > 0) total += e[key];
      if (total <= 0) return undefined;
      let roll = raw() * total;
      for (const e of entries) {
        if (!(e[key] > 0)) continue;
        roll -= e[key];
        if (roll < 0) return e;
      }
      return entries[entries.length - 1];
    },
    // Clamped to +/-3 sd: a 6-sigma harvest is a bug, not a good year.
    normal(mean = 0, sd = 1) {
      const u = Math.max(raw(), Number.EPSILON);
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * raw());
      return mean + sd * Math.max(-3, Math.min(3, z));
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(raw() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

// One stream per (seed, period, system):  const weather = streamFor(s.seed, s.year, 'weather');
export function streamFor(seed, period, label) {
  return makeRng(hashString(`${seed >>> 0}|${period}|${label}`));
}

// A value drawn ONCE and stored (a negotiation's reserve price, a buyer's ceiling)
// must live in state. Re-deriving it per click lets the player probe it by
// clicking again (Touchline negotiations).
