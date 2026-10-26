// Imperator kill-gate model. Numbers only: no UI, no text.
// One rule set for every faction: the player bot and the rivals call the same
// functions (factionTurn, resolveEncounter). Only their parameters differ.
//
// Pure: play(seed, opts) -> final state. No Math.random, no Date.

import { PROVINCES, EDGES, LEGIONS, FRONTIERS, GROUP_OF_PROVINCE, BACKGROUND } from './data.js';
import { streamFor } from './rng.js';

// ---------------------------------------------------------------- config

export const CONFIG = {
  maxTurns: 64,            // March 68 + 64 months
  legionMen: 5000,
  payPerMan: 0.0188,       // k denarii a month; 225 denarii a year
  praetorianPayMult: 3,
  buyPerMan: 0.08,         // k denarii per man at loyalty 50
  promiseMult: 1.5,
  promiseMonths: 6,
  creditPerOpes: 200,
  interest: 0.015,
  levyCost: 320,
  levyMonths: 4,
  letterCost: 20,
  romeGrainNeed: 12,
  stateShare: 0.35,        // emperor's share of neutral provinces' revenue
  donativePraetorians: 1500,
  donativePerLegion: 90,
  holdLoseMonths: 3,
  actIVTurn: 16,           // July 69, Vespasian's proclamation
  declareDeadline: 2,      // months after Act IV opens
  largeBattleMen: 18000,
};

export const DIFFICULTY = {
  legionary: { rivalLevyEvery: 4, plotMult: 2.2, generalMult: 1.6, rivalStat: 3, rivalLoyalty: 14, rivalFunds: 1.8, praetorianDonative: 1000, procPerAct: 1, minorStandAside: 0.4, aiAggr: 0.8, leaderBias: 0, hold: 12, distMult: 0.5,
    dueOnVictory: 4, frontierMult: 0.7, startFunds: 1.2, playerEdge: 1.08, suspicionMult: 0.8, negPenalty: -0.05 },
  centurion: { rivalLevyEvery: 3, plotMult: 1.9, generalMult: 2.8, rivalStat: 3, rivalLoyalty: 14, rivalFunds: 2.0, praetorianDonative: 1500, procPerAct: 2, minorStandAside: 0, aiAggr: 1.0, leaderBias: 0, hold: 18, distMult: 1.0,
    dueOnVictory: 3, frontierMult: 1.0, startFunds: 1.0, playerEdge: 1.0, suspicionMult: 1.0, negPenalty: 0 },
  legate: { rivalLevyEvery: 3, plotMult: 2.6, generalMult: 3.2, rivalStat: 3, rivalLoyalty: 14, rivalFunds: 2.6, praetorianDonative: 2500, procPerAct: 3.5, minorStandAside: 0, aiAggr: 1.2, leaderBias: 1, hold: 24, distMult: 1.0,
    dueOnVictory: 1, frontierMult: 1.4, startFunds: 1.0, playerEdge: 1.0, suspicionMult: 1.3, negPenalty: 0.05 },
};

// Encounter preference order by road; each step is gated by a threshold.
export const ROAD_PREFS = {
  wealth: ['buy', 'negotiate', 'fight', 'bypass'],
  military: ['fight', 'negotiate', 'buy', 'bypass'],
  politics: ['negotiate', 'buy', 'fight', 'bypass'],
  charisma: ['negotiate', 'fight', 'buy', 'bypass'],
};
const NEG_THRESHOLD = { wealth: 0.4, military: 0.4, politics: 0.25, charisma: 0.25 };
const FIGHT_RATIO = { wealth: 1.6, military: 1.15, politics: 1.5, charisma: 1.3 };
const ROAD_STAT = { wealth: 'opes', military: 'virtus', politics: 'auct', charisma: 'gratia' };

// ---------------------------------------------------------------- graph

const ADJ = {};
for (const p of PROVINCES) ADJ[p.id] = [];
for (const [a, b, m, kind] of EDGES) {
  ADJ[a].push({ to: b, m, kind });
  ADJ[b].push({ to: a, m, kind });
}
const PROV = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));
const ITALY = ['NIT', 'ETR', 'ROM', 'CMP'];

export const isWinter = (turn) => { const m = (2 + turn) % 12; return m >= 10 || m <= 1; };
function edgeCost(e, winter) { return e.m + (winter && e.kind !== 'land' ? 1 : 0); }

// Dijkstra; returns { dist, prev }
const PATH_CACHE = new Map();
function paths(from, winter) {
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
function route(a, b, winter) {
  const { prev } = paths(a, winter);
  const out = [];
  let c = b;
  while (c && c !== a) { out.unshift(c); c = prev[c]; }
  return c === a ? out : [];
}

// ---------------------------------------------------------------- state

function newFaction(s, f) {
  const id = f.id || `F${s.nextId++}`;
  const F = {
    id, name: f.name || id, kind: f.kind, road: f.road || 'military',
    stats: { opes: 2, virtus: 2, auct: 2, gratia: 2, ...(f.stats || {}) },
    legit: f.legit ?? 20, treasury: f.treasury ?? 200, borrowed: 0,
    acclaimed: !!f.acclaimed, alive: true, anchored: !!f.anchored, base: f.base,
    target: f.target || 'local', stingy: !!f.stingy, patience: f.patience || 0,
    comrades: f.comrades || null, allies: new Set(f.allies || []),
    leaderArmy: null, levy: null, rebel: !!f.rebel, bornTurn: s.turn, zeroSince: -1,
    allowed: f.allowed || null, declareAt: f.declareAt ?? 4,
  };
  s.factions[F.id] = F;
  return F;
}

function newLegion(s, l) {
  const L = {
    id: l.id || `L${s.nextId++}`, station: l.station, group: l.group, men: l.men ?? CONFIG.legionMen,
    exp: l.exp ?? 1.0, owner: l.owner, loyalty: l.loyalty ?? 60, loc: l.loc ?? l.station, army: null,
    debt: 0, debtDue: -1, payMult: l.payMult ?? 1, standAside: {}, levy: !!l.levy,
  };
  s.legions[L.id] = L;
  return L;
}

export function buildBackground(road, pickOverride) {
  const stats = { opes: 1, virtus: 1, auct: 1, gratia: 1 };
  let legit = 15, comrades = null, enemies = 0;
  const friends = [];
  const key = ROAD_STAT[road];
  const chosen = [];
  for (const stage of BACKGROUND) {
    let opt;
    if (pickOverride && pickOverride[stage.stage]) opt = stage.options.find((o) => o.id === pickOverride[stage.stage]);
    if (!opt) {
      // pick the option that most raises the road's stat, tie-break on total
      opt = stage.options.slice().sort((a, b) =>
        ((b.d[key] || 0) - (a.d[key] || 0)) || (sum(b.d) - sum(a.d)))[0];
    }
    chosen.push(opt.id);
    for (const [k, v] of Object.entries(opt.d)) stats[k] += v;
    legit += opt.legit || 0;
    enemies += opt.enemies || 0;
    if (opt.comrades) comrades = opt.comrades;
    if (opt.friend) friends.push(opt.friend);
  }
  for (const k in stats) stats[k] = Math.max(1, Math.min(6, stats[k]));
  legit += stats.auct * 5;
  return { stats, legit, comrades, enemies, friends, chosen };
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

export function init(seed, opts) {
  const diff = DIFFICULTY[opts.difficulty || 'centurion'];
  const s = {
    seed, turn: 0, opts, diff, nextId: 1,
    prov: {}, legions: {}, factions: {}, armies: {},
    threat: {}, breach: {}, emperor: null, romeUnrest: 20, act: 1, actIVOpen: false,
    stats: { smallFights: 0, largeFights: 0, pSmall: 0, pLarge: 0, buys: 0, negs: 0, negOK: 0, bypasses: 0,
      letters: 0, fightsWon: 0, fightsLost: 0, gainedBy: { buy: 0, negotiate: 0, fight: 0, letter: 0 },
      anchorSaves: 0, histZeroBeforeIV: 0, minorFolded: 0, procSpawned: 0, mutinies: 0, breaches: 0,
      romeTaken: 0, tookRome: false, lostRome: false, maxLegions: 0, debtPeak: 0, legionsTurn16: 0 },
    outcome: null, events: [],
  };
  for (const p of PROVINCES) s.prov[p.id] = { id: p.id, owner: 'state', aux: p.aux, unrest: 10, breachUntil: -1, standAside: {}, towns: townsFor(p) };
  for (const k in FRONTIERS) s.threat[k] = 30;
  newFaction(s, { id: 'state', kind: 'state', name: 'Nero', legit: 50, treasury: 1e9 });
  newFaction(s, { id: 'barbarians', kind: 'barbarian', legit: 0, treasury: 0 }).alive = false;
  for (const l of LEGIONS) newLegion(s, { ...l, owner: 'state', loyalty: 60, exp: 1.0 });
  newLegion(s, { id: 'PRAET', station: 'ROM', group: 'italy', men: 9000, exp: 0.9, owner: 'state', loyalty: 55, payMult: CONFIG.praetorianPayMult });

  // the player: a legate of one legion in the start province
  const bg = buildBackground(opts.road, opts.background);
  const P = newFaction(s, {
    id: 'player', kind: 'player', road: opts.road, stats: bg.stats, legit: bg.legit,
    treasury: (150 + bg.stats.opes * 120) * diff.startFunds, comrades: bg.comrades, base: opts.start,
    allowed: opts.allowed || null, declareAt: opts.declareAt ?? 4, target: 'rome',
  });
  P.enemies = bg.enemies; P.friends = bg.friends; P.suspicion = 0; P.ownsProvince = false;
  P.credit = bg.stats.opes * CONFIG.creditPerOpes + (bg.friends.includes('banker') ? 300 : 0);
  if (bg.friends.includes('senator')) P.legit += 5;
  const here = Object.values(s.legions).filter((l) => l.station === opts.start && l.owner === 'state');
  const mine = here[streamFor(seed, 0, 'start').int(here.length)];
  mine.owner = 'player'; mine.loyalty = 60 + bg.stats.gratia * 3;
  if (opts.start === 'AFR') s.noMacer = true; // you are the legate Clodius Macer would have been
  s.R = rngs(s);
  scheduleSpawns(s);
  return s;
}

// Walled towns: they cannot be bought. Open the gates by negotiation, storm
// them, or march past.
const TOWN_MEN = { legion: 1200, grain: 1500, interior: 1200, proc: 0, italy: 1800 };
function townsFor(p) {
  const men = TOWN_MEN[p.tier] || 0;
  if (!men || p.id === 'ROM') return [];
  const n = p.tier === 'grain' || p.tier === 'italy' || p.rev >= 140 ? 2 : 1;
  return Array.from({ length: n }, (_, i) => ({ men: men - i * 300, base: men - i * 300, standAside: {} }));
}

function rngs(s) {
  return {
    combat: streamFor(s.seed, s.turn, 'combat'), ai: streamFor(s.seed, s.turn, 'ai'),
    events: streamFor(s.seed, s.turn, 'events'), spawn: streamFor(s.seed, s.turn, 'spawn'),
  };
}

function scheduleSpawns(s) {
  const r = streamFor(s.seed, 0, 'schedule');
  s.spawnAt = [];
  const windows = [[1, 5], [5, 10], [10, 15]]; // Acts I-III (calendar windows)
  for (const [a, b] of windows) {
    let n = Math.floor(s.diff.procPerAct);
    if (r.chance(s.diff.procPerAct - n)) n++;
    for (let i = 0; i < n; i++) s.spawnAt.push(r.range(a, b));
  }
  s.minorSkip = {};
  for (const k of ['vindex', 'macer', 'nymphidius', 'capito', 'albinus']) s.minorSkip[k] = r.chance(s.diff.minorStandAside);
}

// ---------------------------------------------------------------- helpers

function log(s, msg) { if (s.opts.trace) s.events.push(`t${s.turn} ${msg}`); }

const ownedLegions = (s, fid) => Object.values(s.legions).filter((l) => l.owner === fid);
const ownedProvinces = (s, fid) => Object.values(s.prov).filter((p) => p.owner === fid);
function legionPower(s, l) { return l.men * l.exp * (0.6 + 0.4 * l.loyalty / 100); }

export function hostile(s, a, b) {
  if (a === b) return false;
  const A = s.factions[a], B = s.factions[b];
  if (!A || !B) return false;
  if (A.allies.has(b) || B.allies.has(a)) return false;
  if (a === 'state') return s.emperor !== b && (B.rebel || B.acclaimed);
  if (b === 'state') return s.emperor !== a && (A.rebel || A.acclaimed);
  return true;
}

function armyPower(s, A) {
  const F = s.factions[A.owner];
  let p = 0;
  for (const id of A.legions) p += legionPower(s, s.legions[id]);
  const lead = A.id === F.leaderArmy ? 1 + 0.06 * F.stats.virtus : 1 + 0.02 * F.stats.virtus;
  return p * lead * (F.kind === 'player' ? s.diff.playerEdge : 1);
}

function bodiesAt(s, fid, pid) {
  const out = [];
  for (const A of Object.values(s.armies)) if (A.loc === pid && hostile(s, fid, A.owner) && A.legions.length) out.push({ kind: 'army', army: A });
  for (const l of Object.values(s.legions)) {
    if (l.loc === pid && !l.army && hostile(s, fid, l.owner) && !(l.standAside[fid] > s.turn)) out.push({ kind: 'legion', legion: l });
  }
  const P = s.prov[pid];
  if (P.aux > 0 && hostile(s, fid, P.owner) && !(P.standAside[fid] > s.turn)) out.push({ kind: 'aux', prov: P });
  if (hostile(s, fid, P.owner)) for (const t of P.towns) if (t.men > 0 && !(t.standAside[fid] > s.turn)) out.push({ kind: 'town', town: t, prov: P });
  return out;
}

function bodyMen(s, b) {
  if (b.kind === 'town' || b.kind === 'raid') return (b.town || b.raid).men;
  if (b.kind === 'army') return b.army.legions.reduce((a, id) => a + s.legions[id].men, 0);
  if (b.kind === 'legion') return b.legion.men;
  return b.prov.aux;
}
function bodyPower(s, b) {
  if (b.kind === 'town') return b.town.men * 0.45 * 1.7; // militia behind walls
  if (b.kind === 'raid') return b.raid.men * 0.75;
  if (b.kind === 'army') return armyPower(s, b.army);
  if (b.kind === 'legion') return legionPower(s, b.legion) * 1.1;
  return b.prov.aux * 0.7 * 1.2;
}
function bodyLoyalty(s, b) {
  const oath = s.turn < 3 && ((b.kind === 'legion' && b.legion.owner === 'state') || (b.kind === 'aux' && b.prov.owner === 'state')) ? 20 : 0;
  return Math.min(100, rawLoyalty(s, b) + oath);
}
function rawLoyalty(s, b) {
  if (b.kind === 'town') return 50 + Math.min(20, s.factions[b.prov.owner].legit / 4);
  if (b.kind === 'raid') return 100;
  if (b.kind === 'army') return b.army.legions.reduce((a, id) => a + s.legions[id].loyalty, 0) / b.army.legions.length;
  if (b.kind === 'legion') return b.legion.loyalty;
  return 55;
}
function bodyGroup(s, b) {
  if (b.kind === 'town' || b.kind === 'raid') return null;
  if (b.kind === 'legion') return b.legion.group;
  if (b.kind === 'army') return s.legions[b.army.legions[0]].group;
  return GROUP_OF_PROVINCE[b.prov.id] || null;
}

function buyCost(s, F, b) {
  return bodyMen(s, b) * CONFIG.buyPerMan * (0.5 + bodyLoyalty(s, b) / 100) / (1 + 0.08 * F.stats.opes);
}
function negotiateChance(s, F, b, ratio) {
  const kind = F.stats.gratia >= F.stats.auct ? 'appeal' : 'oath';
  const stat = kind === 'appeal' ? F.stats.gratia : F.stats.auct;
  let p = 0.08 + 0.065 * stat + (F.legit - 40) / 220 - (bodyLoyalty(s, b) - 50) / 140 - s.diff.negPenalty;
  if (kind === 'appeal' && F.comrades && bodyGroup(s, b) === F.comrades) p += 0.25;
  if (kind === 'oath' && s.emperor === F.id) p += 0.15;
  if (ratio >= 2) p += 0.1;
  if (b.kind === 'army') p -= 0.15;
  return { p: Math.max(0.02, Math.min(0.9, p)), kind };
}

function debtTotal(s, fid) { return ownedLegions(s, fid).reduce((a, l) => a + l.debt, 0); }

function addMoney(F, x) { F.treasury += x; }

function takeLegion(s, l, fid, loyalty) {
  if (l.army) {
    const A = s.armies[l.army];
    A.legions = A.legions.filter((x) => x !== l.id);
    l.army = null;
  }
  l.owner = fid; l.loyalty = loyalty; l.debt = 0; l.debtDue = -1; l.bought = false;
}

function removeLegion(s, l) {
  if (l.army) { const A = s.armies[l.army]; A.legions = A.legions.filter((x) => x !== l.id); }
  delete s.legions[l.id];
}

// ---------------------------------------------------------------- encounters

// F meets body b (with its army A, or as an Act I approach when A is null).
// Returns 'cleared' | 'aside' | 'blocked' | 'lost'.
export function resolveEncounter(s, F, A, b, ctx = {}) {
  const prefs = (F.allowed ? ROAD_PREFS[F.road].filter((o) => F.allowed.includes(o)) : ROAD_PREFS[F.road]);
  const myPower = A ? armyPower(s, A) : ctx.power;
  const ratio = myPower / Math.max(1, bodyPower(s, b));
  const reserve = ownedLegions(s, F.id).reduce((a, l) => a + l.men * CONFIG.payPerMan * l.payMult, 0);
  const aggr = F.kind === 'player' ? 1 : s.diff.aiAggr;
  const isPlayer = F.kind === 'player';
  let tried = false;
  const racing = A && A.dest === 'ROM' && !ctx.destination && (b.kind === 'town' || b.kind === 'aux');
  const order = racing && prefs.includes('bypass') ? ['bypass', ...prefs.filter((o) => o !== 'bypass')] : prefs;
  for (const opt of order) {
    if (opt === 'buy') {
      if (bodyLoyalty(s, b) >= 85 || b.kind === 'army' || b.kind === 'town' || b.kind === 'raid') continue;
      const cost = buyCost(s, F, b);
      const cap = F.road === 'wealth' ? 0.9 : 0.5;
      if (cost <= (F.treasury - reserve) * cap * aggr) {
        addMoney(F, -cost);
        s.stats.buys += isPlayer ? 1 : 0;
        if (isPlayer) s.stats.gainedBy.buy++;
        gainBody(s, F, b, 40 + 2 * F.stats.opes, 0, true);
        if (ctx.act1) F.suspicion += 8 * s.diff.suspicionMult;
        return 'cleared';
      }
      const promiseCap = (1 + F.stats.opes) * 220;
      if ((F.road === 'wealth' || F.road === 'charisma' || !A) && debtTotal(s, F.id) + cost * CONFIG.promiseMult <= promiseCap * aggr) {
        s.stats.buys += isPlayer ? 1 : 0;
        if (isPlayer) s.stats.gainedBy.buy++;
        gainBody(s, F, b, 36 + 2 * F.stats.opes, cost * CONFIG.promiseMult, true);
        if (ctx.act1) F.suspicion += 8 * s.diff.suspicionMult;
        return 'cleared';
      }
    } else if (opt === 'negotiate') {
      const holder = b.legion || b.town || b.prov || b.army;
      holder.negTried = holder.negTried || {};
      if (holder.negTried[F.id] === s.turn || b.kind === 'raid') continue;
      holder.negTried[F.id] = s.turn;
      const { p } = negotiateChance(s, F, b, ratio);
      if (p < NEG_THRESHOLD[F.road] && !(F.allowed && F.allowed.length === 1)) continue;
      b.tried = true; tried = true;
      if (isPlayer) s.stats.negs++;
      if (ctx.act1) F.suspicion += 5 * s.diff.suspicionMult;
      const roll = s.R.combat.next();
      if (roll < p) {
        if (isPlayer) { s.stats.negOK++; s.stats.gainedBy.negotiate++; }
        gainBody(s, F, b, 55 + 3 * Math.max(F.stats.auct, F.stats.gratia), 0);
        F.legit = Math.min(100, F.legit + 1);
        return 'cleared';
      }
      if (roll < p + (1 - p) * 0.35 && b.kind !== 'army') {
        setAside(s, F, b, 3);
        return 'aside';
      }
      F.legit = Math.max(0, F.legit - 1);
    } else if (opt === 'fight') {
      const need = F.allowed && F.allowed.length === 1 ? 0.9 : FIGHT_RATIO[F.road] / Math.max(0.6, aggr);
      if (ratio < need) continue;
      if (ctx.act1 && F.kind === 'player') F.suspicion += 30 * s.diff.suspicionMult;
      const r = fight(s, F, A, b, ctx);
      return r;
    } else if (opt === 'bypass') {
      if (b.kind === 'army' || b.kind === 'raid' || ctx.destination || !A) continue;
      if (isPlayer) s.stats.bypasses++;
      setAside(s, F, b, 1);
      A.bypassed = (A.bypassed || 0) + 1;
      return 'aside';
    }
  }
  // nothing chosen: fight if not hopeless, else hold back
  if (ratio >= 1.0 && (!F.allowed || F.allowed.includes('fight') || F.allowed.length === 1)) return fight(s, F, A, b, ctx);
  return 'blocked';
}

function setAside(s, F, b, months) {
  if (b.kind === 'town') b.town.standAside[F.id] = s.turn + months;
  if (b.kind === 'legion') b.legion.standAside[F.id] = s.turn + months;
  if (b.kind === 'aux') b.prov.standAside[F.id] = s.turn + months;
}

function gainBody(s, F, b, loyalty, debt, bought) {
  if (b.kind === 'legion') {
    takeLegion(s, b.legion, F.id, Math.min(90, loyalty));
    b.legion.bought = !!bought;
    if (debt) { b.legion.debt = debt; b.legion.debtDue = s.turn + CONFIG.promiseMonths; }
  } else if (b.kind === 'aux') {
    const P = b.prov;
    if (P.owner !== F.id && !P.towns.some((t) => t.men > 0)) flipProvince(s, P, F.id, true);
    else P.aux = 0;
  } else if (b.kind === 'town') {
    b.town.men = 0; // gates opened
  }
}

function flipProvince(s, P, fid, keepAux) {
  const old = P.owner;
  P.owner = fid;
  P.unrest = Math.min(100, P.unrest + 10);
  if (!keepAux) P.aux = Math.round(PROV[P.id].aux * 0.4);
  P.standAside = {};
  for (const t of P.towns) { t.men = Math.round(t.base * 0.7); t.standAside = {}; }
  const F = s.factions[fid];
  if (F.kind !== 'state') F.rebel = true;
  if (F.kind === 'player') F.ownsProvince = true;
  // Praetorians follow Rome only by encounter, never automatically
  void old;
}

function fight(s, F, A, b, ctx) {
  const r = s.R.combat;
  const defOwner = b.kind === 'army' ? b.army.owner : b.kind === 'legion' ? b.legion.owner : b.kind === 'raid' ? 'barbarians' : b.prov.owner;
  const D = s.factions[defOwner];
  // pre-battle defections (charisma), same rule both ways
  if (b.kind === 'army' && A) {
    for (const id of [...b.army.legions]) { const l = s.legions[id]; if (l.loyalty < (F.road === 'charisma' ? 58 : 45) && r.chance(0.045 * F.stats.gratia)) takeLegion(s, l, F.id, 45), A.legions.push(id), l.army = A.id, l.loc = A.loc; }
    for (const id of [...A.legions]) { const l = s.legions[id]; if (l.loyalty < (D.road === 'charisma' ? 58 : 45) && r.chance(0.045 * D.stats.gratia)) takeLegion(s, l, D.id, 45), b.army.legions.push(id), l.army = b.army.id, l.loc = b.army.loc; }
    for (const [X, Y, YA] of [[F, D, b.army], [D, F, A]]) {
      if (X.stats.opes < 3) continue;
      const target = YA.legions.map((id) => s.legions[id]).filter((l) => l.loyalty < 50).sort((a, c) => a.loyalty - c.loyalty)[0];
      if (!target) continue;
      const cost = target.men * CONFIG.buyPerMan * (0.5 + target.loyalty / 100) * 1.2 / (1 + 0.08 * X.stats.opes);
      if (X.treasury > cost * 1.5) {
        X.treasury -= cost;
        const XA = X === F ? A : b.army;
        takeLegion(s, target, X.id, 40); target.bought = true; target.army = XA.id; target.loc = XA.loc; XA.legions.push(target.id);
        log(s, `${X.id} buys ${target.id} from ${Y.id} before the battle`);
      }
    }
    if (!b.army.legions.length) return 'cleared';
    if (!A.legions.length) return 'lost';
  }
  if (b.kind === 'army' && A) {
    const ratioD = bodyPower(s, b) / Math.max(1, armyPower(s, A));
    const back = ADJ[b.army.loc].map((e) => e.to).find((p) => s.prov[p].owner === b.army.owner && !Object.values(s.armies).some((x) => x.loc === p && hostile(s, x.owner, b.army.owner)));
    if (ratioD < 0.75 && back && r.chance(0.7)) {
      b.army.loc = back; b.army.path = []; for (const id of b.army.legions) s.legions[id].loc = back;
      log(s, `${b.army.owner} withdraws from ${A.loc} before ${F.id}`);
      return 'cleared';
    }
  }
  const attMen = A ? A.legions.reduce((a, id) => a + s.legions[id].men, 0) : ctx.men;
  const defMen = bodyMen(s, b);
  const large = attMen + defMen >= CONFIG.largeBattleMen && b.kind === 'army';
  const isPlayer = F.kind === 'player' || D.kind === 'player';
  if (large) { s.stats.largeFights++; if (isPlayer) s.stats.pLarge++; } else { s.stats.smallFights++; if (isPlayer) s.stats.pSmall++; }
  const pa = (A ? armyPower(s, A) : ctx.power) * r.float(0.85, 1.15);
  const pd = bodyPower(s, b) * r.float(0.85, 1.15);
  const attWins = pa > pd;
  if (isPlayer || large) log(s, `${large ? 'BATTLE' : 'fight'} ${F.id}(${Math.round(pa)}) vs ${D.id} ${b.kind}(${Math.round(pd)}) at ${A ? A.loc : 'camp'} -> ${attWins ? F.id : D.id}`);
  const lw = attWins ? pd / pa : pa / pd;
  const loserCas = r.float(0.22, 0.38), winnerCas = r.float(0.05, 0.12) * lw;
  const vA = F.stats.virtus, vD = D.stats.virtus;
  const casA = (attWins ? winnerCas : loserCas) * (1 - 0.045 * vA);
  const casD = (attWins ? loserCas : winnerCas) * (1 - 0.045 * vD);
  const attLegs = A ? A.legions.map((id) => s.legions[id]) : (ctx.legions || []);
  for (const l of attLegs) l.men = Math.round(l.men * (1 - casA));
  if (b.kind === 'army') for (const id of b.army.legions) s.legions[id].men = Math.round(s.legions[id].men * (1 - casD));
  else if (b.kind === 'legion') b.legion.men = Math.round(b.legion.men * (1 - casD));
  else if (b.kind === 'town' || b.kind === 'raid') (b.town || b.raid).men = Math.round((b.town || b.raid).men * (1 - casD));
  else b.prov.aux = Math.round(b.prov.aux * (1 - casD));
  // comrades fighting comrades
  const g = bodyGroup(s, b);
  for (const l of attLegs) if (l.group === g) l.loyalty -= 4;
  const winner = attWins ? F : D, loser = attWins ? D : F;
  if (winner.kind === 'player') s.stats.fightsWon++;
  if (loser.kind === 'player') s.stats.fightsLost++;
  winner.legit = Math.min(100, winner.legit + (large ? (winner.road === 'military' ? 7 : 4) : 1));
  loser.legit = Math.max(0, loser.legit - (large ? 6 : 2));
  const winLegs = attWins ? attLegs : (b.kind === 'army' ? b.army.legions.map((id) => s.legions[id]) : b.kind === 'legion' ? [b.legion] : []);
  for (const l of winLegs) l.loyalty = Math.min(100, l.loyalty + (large ? 8 : 4));
  cull(s);
  if (attWins) {
    if (F.kind === 'player') s.stats.gainedBy.fight++;
    if (b.kind === 'army') defeatArmy(s, b.army, F, A, large);
    else if (b.kind === 'legion' && s.legions[b.legion.id]) {
      const l = b.legion;
      if (r.chance(0.5)) { takeLegion(s, l, F.id, 30); if (A) { l.army = A.id; l.loc = A.loc; A.legions.push(l.id); } }
      else retreatLegion(s, l);
    } else if (b.kind === 'aux') {
      b.prov.aux = 0;
      if ((A || ctx.act1) && !b.prov.towns.some((t) => t.men > 0)) flipProvince(s, b.prov, F.id, false);
    } else if (b.kind === 'town') {
      // stormed and sacked: plunder for the men, a stain on the name
      b.town.men = 0;
      if (A) A.wait = 1;
      addMoney(F, 40 + b.town.base * 0.05);
      for (const l of attLegs) if (s.legions[l.id]) l.loyalty = Math.min(100, l.loyalty + 3);
      F.legit = Math.max(0, F.legit - 1);
      b.prov.unrest = Math.min(100, b.prov.unrest + 20);
    } else if (b.kind === 'raid') {
      b.raid.men = 0;
    }
    return 'cleared';
  }
  // attacker lost
  for (const l of attLegs) if (s.legions[l.id]) l.loyalty -= 8;
  if (A) {
    if (A.id === F.leaderArmy) leaderDefeated(s, F, A, large);
    if (s.armies[A.id] && A.from) { A.loc = A.from; A.path = []; }
  }
  return 'lost';
}

function cull(s) {
  for (const l of Object.values(s.legions)) if (l.men < 1000) removeLegion(s, l);
}

function retreatLegion(s, l) {
  const F = s.factions[l.owner];
  const opts = ADJ[l.loc].map((e) => e.to).filter((p) => s.prov[p].owner === l.owner);
  if (opts.length) { if (l.army) takeLegion(s, l, l.owner, l.loyalty); l.loc = opts[0]; return; }
  if (F.anchored && F.base && !s.actIVOpen) { if (l.army) takeLegion(s, l, l.owner, l.loyalty); l.loc = F.base; return; }
  removeLegion(s, l);
}

function defeatArmy(s, D, F, A, large) {
  const owner = s.factions[D.owner];
  const r = s.R.combat;
  for (const id of [...D.legions]) {
    const l = s.legions[id];
    if (!l) continue;
    if (r.chance((large ? 0.45 : 0.35) + (F.road === 'military' ? 0.2 : 0))) { takeLegion(s, l, F.id, 30); if (A) { l.army = A.id; l.loc = A.loc; A.legions.push(l.id); } }
  }
  if (D.id === owner.leaderArmy) leaderDefeated(s, owner, D, large);
  if (s.armies[D.id]) {
    const back = ADJ[D.loc].map((e) => e.to).find((p) => s.prov[p].owner === D.owner);
    if (back) { D.loc = back; D.path = []; for (const id of D.legions) s.legions[id].loc = back; }
    else for (const id of [...D.legions]) retreatLegion(s, s.legions[id]);
  }
}

function leaderDefeated(s, F, A, large) {
  const r = s.R.combat;
  const canRetreat = ADJ[A.loc].some((e) => s.prov[e.to].owner === F.id) || s.prov[A.loc].owner === F.id;
  const pDeath = (large ? 0.3 : 0.05) + (canRetreat ? 0 : 0.5);
  if (r.chance(pDeath)) {
    if (F.anchored && !s.actIVOpen) { s.stats.anchorSaves++; return; }
    killFaction(s, F, 'death');
  }
}

function killFaction(s, F, cause) {
  if (!F.alive) return;
  log(s, `DEAD ${F.id}: ${cause}`);
  F.alive = false;
  if (s.emperor === F.id) s.emperor = null;
  if (F.kind === 'player') { s.outcome = { win: false, cause, turn: s.turn }; return; }
  // its legions and provinces go back to the state (the governors decide later)
  for (const l of ownedLegions(s, F.id)) takeLegion(s, l, 'state', 40);
  for (const p of ownedProvinces(s, F.id)) { p.owner = 'state'; }
  for (const A of Object.values(s.armies)) if (A.owner === F.id) delete s.armies[A.id];
  if (s.emperor === F.id) s.emperor = null;
}

// ---------------------------------------------------------------- history

function spawnFaction(s, spec, provinces, legionFilter) {
  const F = newFaction(s, { ...spec, acclaimed: spec.acclaimed ?? true, rebel: true });
  if (F.kind === 'hist') { for (const k in F.stats) F.stats[k] = Math.min(7, F.stats[k] + s.diff.rivalStat); F.treasury *= s.diff.rivalFunds; F.legit += 3 * s.diff.rivalStat; }
  for (const pid of provinces) {
    const P = s.prov[pid];
    if (P.owner === 'state') { P.owner = F.id; }
    for (const l of Object.values(s.legions)) {
      if (l.loc === pid && l.owner === 'state' && !l.army && (!legionFilter || legionFilter(l))) takeLegion(s, l, F.id, Math.min(82, 62 + (F.kind === 'hist' ? s.diff.rivalLoyalty : 0)));
    }
  }
  return F;
}

// Where a historical claimant rises: his own province if it is free, else the
// nearest neutral province to it. He always rises (the four reach the last act).
function claimantBase(s, home) {
  if (s.prov[home].owner === 'state') return home;
  const free = Object.values(s.prov).filter((p) => p.owner === 'state' && !ITALY.includes(p.id));
  free.sort((a, b) => distance(home, a.id) - distance(home, b.id));
  return free[0]?.id || home;
}

function history(s) {
  const t = s.turn, r = s.R.events;
  const ok = (pid) => s.prov[pid].owner === 'state';
  if (t === 0 && !s.minorSkip.vindex && ok('LUG')) {
    const V = spawnFaction(s, { id: 'vindex', kind: 'minor', road: 'charisma', stats: { gratia: 4, auct: 3, opes: 2, virtus: 1 }, legit: 30, treasury: 300, base: 'LUG', allies: ['galba'] }, ['LUG']);
    for (let i = 0; i < 3; i++) newLegion(s, { station: 'LUG', group: 'gaul', men: 5000, exp: 0.45, owner: V.id, loyalty: 65, levy: true });
  }
  if (t === 1) {
    const base = claimantBase(s, 'TAR');
    spawnFaction(s, { id: 'galba', kind: 'hist', road: 'politics', stats: { auct: 5, opes: 3, virtus: 2, gratia: 1 }, legit: 48, treasury: 500, base, anchored: true, target: 'rome', stingy: true, allies: ['vindex'] }, [base, 'LUS'].filter(ok));
    const xg = s.legions['X-Gem'];
    if (xg && xg.owner === 'state' && !xg.army) { xg.loc = base; xg.station = base; takeLegion(s, xg, 'galba', 60); }
  }
  if (t === 2 && s.factions.vindex?.alive) {
    // Vesontio: the Upper German legions march on Vindex if they are the state's
    const legs = Object.values(s.legions).filter((l) => l.loc === 'GSU' && l.owner === 'state' && !l.army).slice(0, 2);
    if (legs.length) makeArmy(s, 'state', 'GSU', legs.map((l) => l.id), 'LUG');
  }
  if (t === 2 && !s.noMacer && !s.minorSkip.macer && ok('AFR')) {
    spawnFaction(s, { id: 'macer', kind: 'minor', road: 'wealth', stats: { opes: 3, virtus: 2, auct: 2, gratia: 2 }, legit: 22, treasury: 400, base: 'AFR' }, ['AFR']);
  }
  if (t === 3) {
    if (s.factions.galba?.alive) levyLegion(s, s.factions.galba, s.factions.galba.base, 'VII-Galb');
    if (s.factions.macer?.alive) levyLegion(s, s.factions.macer, 'AFR', 'I-Macr');
    // Nero dies. The Senate recognises the most legitimate proclaimed claimant.
    s.factions.state.name = 'Senate';
    for (const l of Object.values(s.legions)) if (l.owner === 'state') l.loyalty -= 12;
    const cands = Object.values(s.factions).filter((f) => f.alive && f.acclaimed && f.kind !== 'state');
    cands.sort((a, b) => b.legit - a.legit);
    if (cands[0]) s.emperor = cands[0].id;
  }
  if (t === 4) {
    const iii = s.legions['III-Gall'];
    if (iii && iii.owner === 'state' && !iii.army && ok('SYR') && ok('MOE')) { iii.loc = 'MOE'; iii.station = 'MOE'; iii.group = 'danube'; }
  }
  if (t === 6 && !s.minorSkip.nymphidius && ok('ROM') && r.chance(0.5)) {
    const N = spawnFaction(s, { id: 'nymphidius', kind: 'minor', road: 'wealth', stats: { opes: 3, gratia: 2, auct: 1, virtus: 1 }, legit: 15, treasury: 300, base: 'ROM' }, ['ROM']);
    void N;
  }
  if (t === 7 && !s.minorSkip.capito && ok('GIN') && r.chance(s.diff.leaderBias ? 0.6 : 0.4)) {
    spawnFaction(s, { id: 'capito', kind: 'minor', road: 'military', stats: { virtus: 3, opes: 2, auct: 2, gratia: 1 }, legit: 20, treasury: 300, base: 'GIN' }, ['GIN'], (l) => r.chance(0.6));
  }
  if (t === 10) {
    // Vitellius on the Rhine
    const base = claimantBase(s, 'GIN');
    {
      const V = spawnFaction(s, { id: 'vitellius', kind: 'hist', road: 'wealth', stats: { opes: 4, virtus: 1, auct: 3, gratia: 3 }, legit: 35, treasury: 700, base, anchored: true, target: 'rome' }, [base]);
      if (ok('GSU')) for (const l of Object.values(s.legions)) if (l.loc === 'GSU' && l.owner === 'state' && !l.army) takeLegion(s, l, V.id, 60);
      if (!ownedLegions(s, V.id).length) newLegion(s, { station: base, group: 'rhine', exp: 0.55, owner: V.id, loyalty: 60, levy: true });
    }
    // Otho strikes in Rome, or from Lusitania
    const G = s.factions.galba;
    const romeOwner = s.prov.ROM.owner;
    let O;
    if ((romeOwner === 'galba' || romeOwner === 'state')) {
      const galbaInRome = Object.values(s.armies).some((A) => A.owner === 'galba' && A.loc === 'ROM' && A.legions.length);
      const base = galbaInRome ? 'CMP' : 'ROM';
      O = newFaction(s, { id: 'otho', kind: 'hist', road: 'charisma', stats: { gratia: 5, auct: 2, opes: 1, virtus: 2 }, legit: 30, treasury: 400, base, anchored: true, target: 'rome', acclaimed: true, rebel: true });
      const pr = s.legions.PRAET;
      if (pr && !pr.army && (pr.owner === 'state' || (pr.owner === 'galba' && pr.loyalty < 60))) {
        takeLegion(s, pr, 'otho', 60); pr.loc = base;
        if (!galbaInRome) s.prov.ROM.owner = 'otho';
      }
      if (s.prov[base].owner === 'state') s.prov[base].owner = 'otho';
      newLegion(s, { id: 'I-Adiut', station: 'CMP', loc: base, group: 'italy', exp: 0.7, owner: 'otho', loyalty: 65, levy: true });
      if (G && G.alive && s.emperor === 'galba' && s.prov.ROM.owner === 'otho') s.emperor = null;
    } else {
      const b2 = claimantBase(s, 'LUS');
      O = spawnFaction(s, { id: 'otho', kind: 'hist', road: 'charisma', stats: { gratia: 5, auct: 2, opes: 1, virtus: 2 }, legit: 30, treasury: 300, base: b2, anchored: true, target: 'rome' }, [b2]);
    }
    if (O && !ownedLegions(s, O.id).length) newLegion(s, { station: O.base, group: 'italy', exp: 0.55, owner: O.id, loyalty: 60, levy: true });
    if (G) G.allies.delete('otho');
  }
  if (t === 11) s.threat.danube += 30; // Roxolani
  if (t === 12 && !s.minorSkip.albinus && ok('MCA')) {
    spawnFaction(s, { id: 'albinus', kind: 'minor', road: 'politics', stats: { auct: 3, opes: 2, virtus: 2, gratia: 2 }, legit: 15, treasury: 250, base: 'MCA' }, ['MCA', 'MTI'].filter(ok));
  }
  if (t === 14) s.threat.britain += 35; // Brigantes
  if (t === CONFIG.actIVTurn) {
    const base = claimantBase(s, 'JUD');
    const V = spawnFaction(s, { id: 'vespasian', kind: 'hist', road: 'military', stats: { virtus: 4, opes: 3, auct: 3, gratia: 3 }, legit: 40, treasury: 800, base, anchored: true, target: 'rome', patience: 6 }, [base, 'SYR', 'EGY'].filter(ok));
    if (!ownedLegions(s, V.id).length) { newLegion(s, { station: base, group: 'east', owner: V.id, loyalty: 60 }); newLegion(s, { station: base, group: 'east', owner: V.id, loyalty: 60 }); }
    openActIV(s);
  }
  if (t === CONFIG.actIVTurn + 1) {
    const V = s.factions.vespasian;
    for (const pid of ['MOE', 'PAN', 'DAL']) if (V?.alive && ok(pid) && r.chance(0.7)) {
      s.prov[pid].owner = V.id;
      for (const l of Object.values(s.legions)) if (l.loc === pid && l.owner === 'state' && !l.army) takeLegion(s, l, V.id, 55);
    }
    const ginLegs = Object.values(s.legions).filter((l) => l.loc === 'GIN').length;
    s.threat.rhine += ginLegs < 2 ? 50 : 20; // Civilis
  }
  if (t === 22) s.threat.africa += 30; // Garamantes
  // in the final act the surviving claimants keep drawing men to their cause
  if (s.actIVOpen && t > CONFIG.actIVTurn && (t - CONFIG.actIVTurn) % s.diff.rivalLevyEvery === 0) {
    for (const f of Object.values(s.factions)) {
      if (!f.alive || f.kind !== 'hist') continue;
      const at = s.prov[f.base]?.owner === f.id ? f.base : ownedProvinces(s, f.id)[0]?.id;
      if (at) newLegion(s, { station: at, group: GROUP_OF_PROVINCE[at] || 'italy', exp: 0.6, owner: f.id, loyalty: 62, levy: true });
    }
  }
}

function openActIV(s) {
  s.actIVOpen = true;
  s.act = 4;
  s.stats.legionsTurn16 = ownedLegions(s, 'player').length;
  // non-historical rivals fold into the strongest claimant within reach
  const claimants = Object.values(s.factions).filter((f) => f.alive && (f.kind === 'hist' || (f.kind === 'player' && f.acclaimed)));
  for (const f of Object.values(s.factions)) {
    if (!f.alive || (f.kind !== 'minor' && f.kind !== 'proc')) continue;
    const base = f.base || ownedProvinces(s, f.id)[0]?.id;
    let best = null, bestScore = -Infinity;
    for (const c of claimants) {
      const cb = c.leaderArmy && s.armies[c.leaderArmy] ? s.armies[c.leaderArmy].loc : c.base;
      const d = base && cb ? distance(base, cb) : 9;
      if (d > 3) continue;
      const score = c.legit + ownedLegions(s, c.id).length * 6 - d * 4 + (c.kind === 'player' ? c.stats.auct + c.stats.gratia : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const to = best ? best.id : 'state';
    for (const l of ownedLegions(s, f.id)) takeLegion(s, l, to, 50);
    for (const p of ownedProvinces(s, f.id)) p.owner = to;
    for (const A of Object.values(s.armies)) if (A.owner === f.id) delete s.armies[A.id];
    f.alive = false;
    s.stats.minorFolded++;
    if (to === 'player') s.stats.foldedToPlayer = (s.stats.foldedToPlayer || 0) + 1;
  }
  for (const f of Object.values(s.factions)) if (f.kind === 'hist') f.anchored = false;
}

function spawnProcedural(s) {
  const r = s.R.spawn;
  // a legate whose men will follow him: a legion with weak loyalty, not in a leader's army
  const cands = Object.values(s.legions).filter((l) => !l.army && l.loyalty < 62 && l.id !== 'PRAET' &&
    !(s.factions[l.owner].kind === 'hist' && s.factions[l.owner].anchored && ownedLegions(s, l.owner).length <= 1) &&
    !(l.owner === 'player' && ownedLegions(s, 'player').length <= 1));
  if (!cands.length) return;
  const l = r.pick(cands);
  const prev = s.factions[l.owner];
  const roads = ['wealth', 'military', 'politics', 'charisma'];
  const F = newFaction(s, {
    kind: 'proc', road: r.pick(roads), acclaimed: true, rebel: true, base: l.loc, legit: 12 + r.int(15), treasury: 150 + r.int(250),
    stats: { opes: r.range(1, 4), virtus: r.range(1, 4), auct: r.range(1, 4), gratia: r.range(1, 4) },
  });
  takeLegion(s, l, F.id, 65);
  const more = Object.values(s.legions).find((o) => o.loc === l.loc && o.owner === prev.id && !o.army && o.loyalty < 50 && o.id !== 'PRAET');
  if (more && r.chance(0.5)) takeLegion(s, more, F.id, 60);
  const P = s.prov[l.loc];
  if (P.owner === prev.id || P.owner === 'state') { if (!(prev.kind === 'player' && ownedLegions(s, 'player').some((x) => x.loc === l.loc))) P.owner = F.id; }
  s.stats.procSpawned++;
  log(s, `proc ${F.id} rises at ${l.loc} from ${prev.id}`);
  if (prev.kind === 'player') s.stats.ownLegateRevolts = (s.stats.ownLegateRevolts || 0) + 1;
}

// ---------------------------------------------------------------- economy

function levyLegion(s, F, pid, id) {
  newLegion(s, { id, station: pid, group: GROUP_OF_PROVINCE[pid] || 'italy', exp: 0.6, owner: F.id, loyalty: 62, levy: true });
}

function economy(s) {
  const winter = isWinter(s.turn);
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state') continue;
    let inc = 0;
    for (const P of ownedProvinces(s, F.id)) {
      if (P.breachUntil > s.turn) continue;
      const tax = P.tax === 'heavy' ? 1.4 : P.tax === 'extort' ? 1.8 : 1;
      inc += PROV[P.id].rev * tax * (P.unrest > 60 ? 0.5 : 1);
    }
    if (s.emperor === F.id) for (const P of ownedProvinces(s, 'state')) inc += PROV[P.id].rev * CONFIG.stateShare;
    F.treasury += inc;
    // pay: before you hold a province, the state still pays your legion
    const legs = ownedLegions(s, F.id);
    if (F.kind === 'player' && !F.ownsProvince) continue;
    const pay = legs.reduce((a, l) => a + l.men * CONFIG.payPerMan * l.payMult, 0);
    F.treasury -= pay;
    F.treasury -= F.borrowed * CONFIG.interest;
    // debts falling due
    for (const l of legs) {
      if (l.debt > 0 && l.debtDue <= s.turn) {
        if (!F.stingy && F.treasury >= l.debt) { F.treasury -= l.debt; l.debt = 0; l.debtDue = -1; l.loyalty += 4; }
        else { l.overdue = true; }
      }
    }
    const credit = F.credit ?? F.stats.opes * CONFIG.creditPerOpes;
    if (F.treasury < 0 && F.borrowed < credit) { const b = Math.min(credit - F.borrowed, -F.treasury); F.borrowed += b; F.treasury += b; }
    F.unpaid = F.treasury < 0;
    if (F.kind === 'player') s.stats.debtPeak = Math.max(s.stats.debtPeak, debtTotal(s, F.id) + F.borrowed);
  }
  // Rome's grain
  if (s.emperor) {
    let g = 0;
    for (const P of Object.values(s.prov)) {
      if (P.owner !== s.emperor && P.owner !== 'state') continue;
      g += PROV[P.id].grain * (winter ? 0.5 : 1);
    }
    const E = s.factions[s.emperor];
    const short = CONFIG.romeGrainNeed * (winter ? 0.5 : 1) - g;
    s.romeUnrest += short > 0 ? short * 5 : -5;
    s.romeUnrest -= E.stats.gratia * 0.4;
    s.romeUnrest = Math.max(0, Math.min(100, s.romeUnrest));
    if (s.romeUnrest > 60) { E.legit -= 3; const pr = s.legions.PRAET; if (pr && pr.owner === E.id) pr.loyalty -= 4; }
    if (s.romeUnrest > 90) E.legit -= 5;
  }
}

function loyalty(s) {
  for (const l of Object.values(s.legions)) {
    const F = s.factions[l.owner];
    if (F.kind === 'state') {
      if (s.emperor && s.factions[s.emperor]?.stingy) l.loyalty -= 0.7;
      else l.loyalty += (55 - l.loyalty) * 0.05;
      continue;
    }
    const inLeader = l.army && l.army === F.leaderArmy;
    let d = 0;
    if (F.kind !== 'player' || F.ownsProvince) d += F.unpaid ? -8 : 1;
    const dist = distance(l.station, l.loc);
    let decay = Math.min(4, 0.6 * Math.max(0, dist - 1)) * (F.kind === 'player' ? s.diff.distMult : 1);
    if (inLeader && F.road === 'charisma') decay *= 0.5;
    d -= decay;
    if (inLeader) d += 0.3 * F.stats.gratia;
    if (l.overdue && l.debt > 0) d -= 6;
    if (l.loc === l.station && !l.army) d += 0.5;
    if (l.bought) d -= 0.7; // bought men stay bought only while the money lasts
    if (F.legit > 60) d += 0.5;
    l.loyalty = Math.max(0, Math.min(100, l.loyalty + d));
  }
}

function mutinies(s) {
  const r = s.R.events;
  for (const l of Object.values(s.legions)) {
    if (l.loyalty >= 15 || s.factions[l.owner].kind === 'state') continue;
    const F = s.factions[l.owner];
    s.stats.mutinies += F.kind === 'player' ? 1 : 0;
    const near = Object.values(s.armies).find((A) => A.loc === l.loc && hostile(s, l.owner, A.owner) && A.legions.length);
    if (near) takeLegion(s, l, near.owner, 40);
    else if (!s.actIVOpen && r.chance(0.5)) {
      const N = newFaction(s, { kind: 'proc', road: r.pick(['wealth', 'military', 'politics', 'charisma']), acclaimed: true, rebel: true, base: l.loc, legit: 10, treasury: 100 });
      takeLegion(s, l, N.id, 55);
      s.stats.procSpawned++;
    } else takeLegion(s, l, 'state', 40);
  }
  // the player's army as a whole
  const P = s.factions.player;
  const mine = ownedLegions(s, 'player');
  if (P.alive && mine.length) {
    const men = mine.reduce((a, l) => a + l.men, 0);
    const avg = mine.reduce((a, l) => a + l.loyalty * l.men, 0) / men;
    if (avg < 20) killFaction(s, P, 'mutiny');
  }
}

// Raiders over a weak frontier and brigands in unruly provinces: fight or suffer.
function raids(s) {
  const r = s.R.events;
  const hits = [];
  for (const [k, f] of Object.entries(FRONTIERS)) if (s.threat[k] > 55 && r.chance(0.12 + (s.threat[k] - 55) / 150)) hits.push({ pid: r.pick(f.provinces), men: r.range(2000, 6000) });
  for (const P of Object.values(s.prov)) if (P.owner !== 'state' && P.unrest > 50 && r.chance(0.2)) hits.push({ pid: P.id, men: r.range(1000, 2500), brigands: true });
  for (const h of hits) {
    const P = s.prov[h.pid];
    const O = s.factions[P.owner];
    if (!O.alive || O.kind === 'state') continue;
    const legs = Object.values(s.legions).filter((l) => l.loc === P.id && l.owner === O.id);
    const body = { kind: 'raid', raid: { men: h.men } };
    if (legs.length) {
      const power = legs.reduce((a, l) => a + legionPower(s, l), 0);
      const res = fight(s, O, null, body, { power, men: legs.reduce((a, l) => a + l.men, 0), legions: legs });
      if (res === 'cleared') continue;
    }
    P.unrest = Math.min(100, P.unrest + 15);
    P.breachUntil = Math.max(P.breachUntil, s.turn + 1);
    if (!h.brigands) for (const [k, f] of Object.entries(FRONTIERS)) if (f.provinces.includes(P.id)) s.threat[k] += 5;
  }
}

function frontiers(s) {
  for (const [k, f] of Object.entries(FRONTIERS)) {
    const present = Object.values(s.legions).filter((l) => f.provinces.includes(l.loc)).length;
    const deficit = Math.max(0, f.normal - present) / f.normal;
    s.threat[k] += f.base * (0.3 + 2.5 * deficit) * s.diff.frontierMult - (deficit === 0 ? 4 : 0);
    s.threat[k] = Math.max(0, Math.min(120, s.threat[k]));
    if (s.threat[k] >= 100) {
      s.threat[k] = 40;
      for (const pid of f.provinces) {
        const P = s.prov[pid];
        P.breachUntil = s.turn + 4;
        P.unrest = Math.min(100, P.unrest + 30);
        const O = s.factions[P.owner];
        if (O.kind !== 'state') O.legit = Math.max(0, O.legit - 8);
        if (O.kind === 'player') s.stats.breaches++;
        for (const l of Object.values(s.legions)) if (l.loc === pid) l.men = Math.round(l.men * 0.85);
        if (!Object.values(s.legions).some((l) => l.loc === pid && l.owner === P.owner)) P.owner = 'state';
      }
      cull(s);
    }
  }
  for (const P of Object.values(s.prov)) {
    if (P.owner === 'state') { P.unrest = Math.max(0, P.unrest - 2); continue; }
    P.unrest += P.tax === 'heavy' ? 3 : P.tax === 'extort' ? 9 : -3;
    P.unrest = Math.max(0, Math.min(100, P.unrest));
    if (P.unrest > 85 && !Object.values(s.legions).some((l) => l.loc === P.id && l.owner === P.owner)) {
      const O = s.factions[P.owner];
      O.legit = Math.max(0, O.legit - 5);
      P.owner = 'state'; P.aux = PROV[P.id].aux; P.unrest = 40;
    }
  }
}

// ---------------------------------------------------------------- AI (all factions)

function makeArmy(s, owner, loc, legionIds, dest) {
  const A = { id: `A${s.nextId++}`, owner, loc, legions: [], path: [], edgeLeft: 0, dest: null, from: loc, bypassed: 0 };
  for (const id of legionIds) { const l = s.legions[id]; if (l.army) takeLegion(s, l, l.owner, l.loyalty); l.army = A.id; l.loc = loc; A.legions.push(id); }
  s.armies[A.id] = A;
  if (dest) setDest(s, A, dest);
  return A;
}
function setDest(s, A, dest) {
  if (A.dest === dest && A.path.length) return;
  A.dest = dest;
  A.path = dest === A.loc ? [] : route(A.loc, dest, isWinter(s.turn));
  A.edgeLeft = 0;
}

function factionTurn(s, F) {
  if (!F.alive) return;
  const r = s.R.ai;
  const legs = ownedLegions(s, F.id);
  const provs = ownedProvinces(s, F.id);
  // provinces: tax
  for (const P of provs) {
    if (F.road === 'wealth') P.tax = P.unrest < 35 ? 'heavy' : 'normal';
    else P.tax = F.treasury < 0 ? 'heavy' : 'normal';
    if (F.borrowed >= (F.credit ?? F.stats.opes * CONFIG.creditPerOpes) && F.treasury < 0) P.tax = 'extort';
  }
  // levy
  if (F.levy && F.levy.done <= s.turn) { levyLegion(s, F, F.levy.at, undefined); F.levy = null; }
  const reserve = legs.reduce((a, l) => a + l.men * CONFIG.payPerMan * l.payMult, 0) * 2;
  const levyWant = F.road === 'military' ? 14 : 5;
  if (!F.levy && legs.length < levyWant && F.treasury > CONFIG.levyCost + reserve) {
    const at = provs.find((p) => ['legion', 'grain'].includes(PROV[p.id].tier) && p.unrest < 60) || provs.find((p) => PROV[p.id].tier !== 'proc' && p.unrest < 70);
    if (at) { F.treasury -= CONFIG.levyCost; F.levy = { at: at.id, done: s.turn + CONFIG.levyMonths - (F.road === 'military' ? 1 : 0) - (at.id === 'AFR' ? 1 : 0) }; }
  }
  // pay overdue debts if possible (stingy never does)
  if (!F.stingy) for (const l of legs) if (l.overdue && l.debt > 0 && F.treasury - l.debt > reserve / 2) { F.treasury -= l.debt; l.debt = 0; l.overdue = false; l.loyalty += 4; }
  // letters (politics road writes two)
  const letters = F.road === 'politics' ? 2 : 1;
  for (let i = 0; i < letters && F.treasury > CONFIG.letterCost && (F.rebel || F.kind !== 'player'); i++) {
    const near = new Set();
    for (const P of provs) for (const e of ADJ[P.id]) near.add(e.to);
    const cand = [...near].filter((pid) => s.prov[pid].owner === 'state' && !Object.values(s.legions).some((l) => l.loc === pid));
    if (!cand.length) break;
    const pid = r.pick(cand);
    F.treasury -= CONFIG.letterCost;
    if (F.kind === 'player') s.stats.letters++;
    const p = 0.04 + 0.04 * F.stats.auct + (F.legit - 30) / 400 + (s.emperor === F.id ? 0.1 : 0);
    if (r.chance(Math.max(0.01, p))) { flipProvince(s, s.prov[pid], F.id, true); if (F.kind === 'player') s.stats.gainedBy.letter++; }
  }

  if (F.kind === 'player') playerStrategy(s, F);
  else rivalStrategy(s, F);
}

function leaderArmyOf(s, F) {
  let A = F.leaderArmy && s.armies[F.leaderArmy];
  if (A && !A.legions.length) { delete s.armies[A.id]; A = null; F.leaderArmy = null; }
  if (!A) {
    const legs = ownedLegions(s, F.id).filter((l) => !l.army);
    if (!legs.length) {
      const any = Object.values(s.armies).find((x) => x.owner === F.id && x.legions.length);
      if (any) { F.leaderArmy = any.id; return any; }
      return null;
    }
    const byLoc = {};
    for (const l of legs) byLoc[l.loc] = (byLoc[l.loc] || 0) + 1;
    const loc = Object.entries(byLoc).sort((a, b) => b[1] - a[1])[0][0];
    A = makeArmy(s, F.id, loc, legs.filter((l) => l.loc === loc).map((l) => l.id));
    F.leaderArmy = A.id;
  }
  return A;
}

function gatherForces(s, F, A, keepFrontier) {
  for (const l of ownedLegions(s, F.id)) {
    if (l.army || l.id === 'PRAET') continue;
    const P = PROV[l.loc];
    if (keepFrontier && P.frontier && s.threat[P.frontier] > keepFrontier && s.prov[l.loc].owner === F.id) {
      const kept = ownedLegions(s, F.id).filter((x) => x.loc === l.loc && !x.army && x !== l).length;
      if (kept === 0) continue; // the last legion on a threatened frontier stays
    }
    if (l.loc === A.loc && !A.path.length) { l.army = A.id; A.legions.push(l.id); }
    else {
      const R = Object.values(s.armies).find((x) => x.owner === F.id && x.id !== A.id && x.loc === l.loc && x.dest === A.loc);
      if (R) { l.army = R.id; R.legions.push(l.id); }
      else makeArmy(s, F.id, l.loc, [l.id], A.loc);
    }
  }
  // reinforcement columns retarget to the leader
  for (const R of Object.values(s.armies)) if (R.owner === F.id && R.id !== A.id) {
    if (R.loc === A.loc) { for (const id of R.legions) { s.legions[id].army = A.id; A.legions.push(id); } delete s.armies[R.id]; }
    else setDest(s, R, A.loc);
  }
}

function strengthOf(s, fid) { return ownedLegions(s, fid).reduce((a, l) => a + legionPower(s, l), 0); }

function pickExpansion(s, F, A) {
  const myP = armyPower(s, A);
  let best = null, bestScore = -Infinity;
  const leader = s.diff.leaderBias ? strongestFaction(s) : null;
  for (const P of Object.values(s.prov)) {
    if (P.owner === F.id || !hostile(s, F.id, P.owner) && P.owner !== 'state') continue;
    if (P.owner === 'state' && s.emperor === F.id) continue;
    if (ITALY.includes(P.id)) continue;
    if ((F.kind === 'minor' || F.kind === 'proc') && !ADJ[P.id].some((e) => s.prov[e.to].owner === F.id)) continue;
    const d = distance(A.loc, P.id, isWinter(s.turn));
    if (d > (F.kind === 'minor' || F.kind === 'proc' ? 2 : 3)) continue;
    if (route(A.loc, P.id, isWinter(s.turn)).some((x) => ITALY.includes(x))) continue;
    const def = Object.values(s.legions).filter((l) => l.loc === P.id && l.owner === P.owner).reduce((a, l) => a + legionPower(s, l), 0) + P.aux * 0.8;
    if (def > myP * 1.2) continue;
    // do not walk into a stronger army
    const danger = Object.values(s.armies).filter((x) => hostile(s, F.id, x.owner) && x.legions.length && (x.loc === P.id || ADJ[P.id].some((e) => e.to === x.loc))).reduce((a, x) => a + armyPower(s, x), 0);
    if (danger > myP * 0.9) continue;
    const legHere = Object.values(s.legions).filter((l) => l.loc === P.id && l.owner === P.owner).length;
    let score = PROV[P.id].rev / 100 + PROV[P.id].grain * (F.road === 'wealth' ? 0.8 : 0.4) + legHere * 1.5 - d * 0.8 - def / Math.max(1, myP) * 2;
    if (leader && P.owner === leader && leader !== F.id) score += 2;
    if (score > bestScore) { bestScore = score; best = P.id; }
  }
  return best;
}

function strongestFaction(s) {
  let best = null, bs = -1;
  for (const f of Object.values(s.factions)) if (f.alive && f.kind !== 'state') { const x = strengthOf(s, f.id); if (x > bs) { bs = x; best = f.id; } }
  return best;
}

function rivalStrategy(s, F) {
  const A = leaderArmyOf(s, F);
  if (!A) return;
  gatherForces(s, F, A, F.kind === 'hist' ? 70 : 60);
  if (!s.R.ai.chance(Math.min(1, s.diff.aiAggr))) return; // slow rivals on Legionary
  const legs = ownedLegions(s, F.id).length;
  const holdsRome = s.prov.ROM.owner === F.id;
  if (holdsRome) { if (!clearGates(s, F, A)) setDest(s, A, 'ROM'); return; }
  const romeReady = F.target === 'rome' && (s.actIVOpen ? readyForRome(s, F) : legs >= (F.patience || 3) && s.turn >= 3);
  if (romeReady || (F.kind === 'proc' && legs >= 5)) { setDest(s, A, 'ROM'); return; }
  expand(s, F, A);
}

// keep the current target until it is taken or out of reach
function expand(s, F, A) {
  if (A.dest && A.dest !== 'ROM' && s.prov[A.dest].owner !== F.id && A.path.length && !ITALY.includes(A.dest)) return;
  const t = pickExpansion(s, F, A);
  if (t) setDest(s, A, t);
  else { A.dest = null; A.path = []; }
}

// Holding Rome but not yet recognised: clear the nearest beatable enemy at the gates.
function clearGates(s, F, A) {
  if (s.emperor === F.id) return false;
  const myP = armyPower(s, A);
  for (const pid of ['ETR', 'CMP', 'NIT']) {
    const foe = Object.values(s.legions).filter((l) => l.loc === pid && hostile(s, F.id, l.owner) && l.owner !== 'state');
    const p = foe.reduce((a, l) => a + legionPower(s, l), 0);
    if (foe.length && p < myP * 0.7) { setDest(s, A, pid); return true; }
  }
  return false;
}

function playerStrategy(s, F) {
  // Act I: approach the other bodies in your province, one a month
  if (!F.ownsProvince) {
    const here = F.base;
    const mine = ownedLegions(s, F.id);
    const myLeg = mine.find((l) => l.loc === here) || mine[0];
    if (!myLeg) return;
    const ctxPower = mine.filter((l) => l.loc === here).reduce((a, l) => a + legionPower(s, l), 0);
    const others = Object.values(s.legions).filter((l) => l.loc === here && l.owner !== F.id && !l.army);
    const menMine = mine.filter((l) => l.loc === here).reduce((a, l) => a + l.men, 0);
    const menAll = menMine + others.reduce((a, l) => a + l.men, 0);
    let b;
    if (menMine / menAll >= 0.74 || !others.length) b = { kind: 'aux', prov: s.prov[here] };
    else {
      const o = others.filter((l) => !(l.standAside.player > s.turn)).sort((a, c) => a.loyalty - c.loyalty)[0];
      if (o) b = { kind: 'legion', legion: o };
    }
    if (b && (b.kind !== 'aux' || hostileForAct1(s, b))) {
      const legsHere = mine.filter((l) => l.loc === here);
      const res = resolveEncounter(s, F, null, b, { act1: true, power: ctxPower, men: menMine, legions: legsHere });
      if (b.kind === 'aux' && (res === 'cleared' || res === 'aside')) flipProvince(s, s.prov[here], F.id, res !== 'cleared' ? true : true);
    }
    F.suspicion = Math.max(0, F.suspicion - 3);
    if (F.suspicion >= 100) {
      if (menMine / Math.max(1, menAll) >= 0.74) flipProvince(s, s.prov[here], F.id, true);
      else killFaction(s, F, 'recalled');
    }
    return;
  }
  const A = leaderArmyOf(s, F);
  if (!A) return;
  gatherForces(s, F, A, 65);
  const legs = ownedLegions(s, F.id).length;
  // acclamation
  if (!F.acclaimed && (legs >= F.declareAt || s.turn >= 9 || s.actIVOpen)) acclaim(s, F);
  if (s.prov.ROM.owner === F.id) { if (!clearGates(s, F, A)) setDest(s, A, 'ROM'); return; }
  if (A.dest && ['ETR', 'CMP', 'NIT'].includes(A.dest) && A.path.length) return;
  const romeReady = F.acclaimed && readyForRome(s, F);
  if (romeReady) {
    // the wealth road takes the grain first if it is close
    if (F.road === 'wealth') {
      for (const g of ['AFR', 'EGY']) if (s.prov[g].owner !== F.id && distance(A.loc, g) <= 2 && !s.actIVOpen) { setDest(s, A, g); return; }
    }
    setDest(s, A, 'ROM');
    return;
  }
  expand(s, F, A);
}

function hostileForAct1(s, b) { return b.prov.owner === 'state'; }

function romeDefence(s, fid) {
  let d = 0;
  for (const l of Object.values(s.legions)) if (ITALY.includes(l.loc) && hostile(s, fid, l.owner)) d += legionPower(s, l);
  return d;
}
function readyForRome(s, F) {
  const legs = ownedLegions(s, F.id).length;
  const ratio = strengthOf(s, F.id) / Math.max(1, romeDefence(s, F.id));
  if (s.actIVOpen) return ratio >= 0.6 || s.turn >= CONFIG.actIVTurn + 4;
  return legs >= F.declareAt + 2 && ratio >= 1.0 && s.turn >= CONFIG.actIVTurn - 4;
}

function acclaim(s, F) {
  F.acclaimed = true; F.rebel = true;
  F.legit = Math.min(100, F.legit + 10);
  for (const l of ownedLegions(s, F.id)) {
    l.debt += CONFIG.donativePerLegion;
    l.debtDue = l.debtDue >= 0 ? Math.min(l.debtDue, s.turn + s.diff.dueOnVictory) : s.turn + s.diff.dueOnVictory + 2;
  }
  F.acclaimedTurn = s.turn;
  log(s, `${F.id} acclaimed with ${ownedLegions(s, F.id).length} legions`);
}

// ---------------------------------------------------------------- movement

function movement(s) {
  const winter = isWinter(s.turn);
  const order = Object.values(s.armies).sort((a, b) => a.id < b.id ? -1 : 1);
  for (const A of order) {
    if (!s.armies[A.id] || !A.legions.length) { delete s.armies[A.id]; continue; }
    const F = s.factions[A.owner];
    if (!F.alive) continue;
    if (A.bypassed) {
      for (const id of A.legions) { const l = s.legions[id]; l.men = Math.round(l.men * (1 - Math.min(0.04, 0.01 * A.bypassed))); l.loyalty -= 1; }
      A.bypassed = Math.max(0, A.bypassed - 1);
    }
    if (A.wait > 0) { A.wait--; continue; }
    if (!A.path.length) { engage(s, A, A.loc, true); continue; }
    if (A.edgeLeft <= 0) {
      const e = ADJ[A.loc].find((x) => x.to === A.path[0]);
      if (!e) { A.path = []; continue; }
      A.edgeLeft = edgeCost(e, winter);
      A.edgeKind = e.kind;
    }
    A.edgeLeft--;
    if (A.edgeLeft > 0) continue;
    if (winter && A.edgeKind !== 'land') for (const id of A.legions) s.legions[id].men = Math.round(s.legions[id].men * (A.edgeKind === 'alps' ? 0.94 : 0.97));
    A.from = A.loc;
    A.loc = A.path.shift();
    for (const id of A.legions) s.legions[id].loc = A.loc;
    const res = engage(s, A, A.loc, A.loc === A.dest || !A.path.length);
    if (res === 'blocked' && s.armies[A.id]) { A.loc = A.from; for (const id of A.legions) s.legions[id].loc = A.loc; A.path.unshift(A.dest ? A.path[0] || A.dest : A.loc); A.path = route(A.loc, A.dest, winter); }
  }
  cull(s);
}

function engage(s, A, pid, destination) {
  const F = s.factions[A.owner];
  let guard = 0;
  while (guard++ < 8 && s.armies[A.id] && A.legions.length && F.alive) {
    const bodies = bodiesAt(s, F.id, pid);
    if (!bodies.length) break;
    // armies first, then legions, then the garrison
    bodies.sort((a, b) => (a.kind === 'army' ? 0 : a.kind === 'legion' ? 1 : 2) - (b.kind === 'army' ? 0 : b.kind === 'legion' ? 1 : 2));
    const b = bodies[0];
    // the state does not attack peaceful governors' provinces on its own
    if (F.kind === 'state' && b.kind === 'aux') break;
    const res = resolveEncounter(s, F, A, b, { destination });
    if (res === 'lost' || res === 'blocked') return res;
  }
  if (!s.armies[A.id] || !A.legions.length) return 'lost';
  if (!bodiesAt(s, F.id, pid).length) {
    const P = s.prov[pid];
    if (P.owner !== F.id && (hostile(s, F.id, P.owner) || (P.owner === 'state' && F.kind !== 'state' && s.emperor !== F.id))) flipProvince(s, P, F.id, P.aux > 0);
  }
  return 'ok';
}

// ---------------------------------------------------------------- Rome and the end

function rome(s) {
  const owner = s.prov.ROM.owner;
  const O = s.factions[owner];
  const italyHostile = Object.values(s.legions).some((l) => ['ROM', 'ETR', 'CMP'].includes(l.loc) && hostile(s, owner, l.owner) && l.owner !== 'state');
  const terror = O && Object.values(s.legions).filter((l) => ITALY.includes(l.loc) && l.owner === owner).length >= 5;
  if (O && O.kind !== 'state' && O.acclaimed && !italyHostile && (O.legit >= 25 || terror) && s.emperor !== owner) {
    s.emperor = owner;
    log(s, `EMPEROR ${owner}`);
    O.legit = Math.min(100, O.legit + (O.legit >= 25 ? 15 : 5)); // a frightened Senate gives less
    for (const l of ownedLegions(s, owner)) {
      l.debt += l.id === 'PRAET' ? s.diff.praetorianDonative : CONFIG.donativePerLegion;
      l.debtDue = s.turn + s.diff.dueOnVictory;
    }
    if (owner === 'player') { s.stats.tookRome = true; s.stats.romeTaken++; }
  }
  const P = s.factions.player;
  if (!P.alive) return;
  if (s.emperor === 'player' && owner === 'player') {
    P.lostRomeAt = -1;
    if (s.actIVOpen) P.hold = (P.hold || 0) + 1;
    if (P.hold >= s.diff.hold) s.outcome = { win: true, cause: 'held Rome', turn: s.turn };
  } else if (s.stats.tookRome && owner !== 'player') {
    if (P.lostRomeAt < 0 || P.lostRomeAt === undefined) P.lostRomeAt = s.turn;
    s.stats.lostRome = true;
    if (s.emperor === 'player') s.emperor = null;
    if (s.turn - P.lostRomeAt >= CONFIG.holdLoseMonths) killFaction(s, P, 'lost the throne');
  }
  // Praetorian assassination
  const pr = s.legions.PRAET;
  if (pr && s.emperor && pr.owner === s.emperor && pr.loyalty < 15) {
    const E = s.factions[s.emperor];
    if (E.anchored && !s.actIVOpen) { s.stats.anchorSaves++; pr.loyalty = 30; }
    else { takeLegion(s, pr, 'state', 50); killFaction(s, E, 'murdered by the Praetorians'); }
  }
}

// Holding Rome: conspiracies, generals, the grain dole and the Senate's price.
// Same rules for any emperor; the player is the one measured.
function hold(s) {
  const E = s.emperor && s.factions[s.emperor];
  if (!E || !E.alive || !s.actIVOpen || s.prov.ROM.owner !== E.id) return;
  const r = s.R.events;
  const italyLegs = Object.values(s.legions).filter((l) => ITALY.includes(l.loc) && l.owner === E.id).length;
  // spending: the dole and the Senate
  if (s.romeUnrest > 40 && E.treasury > 400) { E.treasury -= 150; s.romeUnrest = Math.max(0, s.romeUnrest - 15); }
  if (E.road === 'wealth' && E.legit < 50 && E.treasury > 600) { E.treasury -= 200; E.legit += 4; }
  if (E.road === 'politics' && E.legit < 70 && E.treasury > 300) { E.treasury -= 80; E.legit += 2; } // consulships for friends
  if (E.road === 'charisma' && E.legit < 60 && E.treasury > 250) { E.treasury -= 100; E.legit += 2; s.romeUnrest = Math.max(0, s.romeUnrest - 10); } // games and largesse
  // conspiracy
  const plot = Math.max(0, (40 - E.legit) / 120 + s.romeUnrest / 500) * s.diff.plotMult * Math.max(0.6, 1 - 0.05 * italyLegs) * (1 - 0.05 * E.stats[ROAD_STAT[E.road]]);
  if (r.chance(plot)) {
    // each road's own strength protects: the guard, the Senate's warnings, the crowd, paid informers
    const kill = 0.45 - 0.045 * E.stats[ROAD_STAT[E.road]];
    if (E.kind === 'player') s.stats.plots = (s.stats.plots || 0) + 1;
    if (r.chance(kill)) { killFaction(s, E, 'murdered by conspirators'); return; }
    E.legit = Math.max(0, E.legit - 3);
  }
  // generals: legions away from the emperor, disloyal, go over to a living rival
  const rivals = Object.values(s.factions).filter((f) => f.alive && f.kind === 'hist' && f.id !== E.id);
  for (const l of ownedLegions(s, E.id)) {
    if (l.army === E.leaderArmy || l.id === 'PRAET' || l.loyalty >= 50) continue;
    if (!r.chance(0.04 * s.diff.generalMult * (1 - 0.08 * E.stats.gratia))) continue;
    const to = rivals.length ? rivals.sort((a, b) => distance(l.loc, a.base) - distance(l.loc, b.base))[0].id : 'state';
    takeLegion(s, l, to, 50);
    if (E.kind === 'player') s.stats.generalsLost = (s.stats.generalsLost || 0) + 1;
    log(s, `general with ${l.id} goes over to ${to}`);
  }
}

function checks(s) {
  const P = s.factions.player;
  if (!P.alive) return;
  if (s.actIVOpen && !P.acclaimed && s.turn >= CONFIG.actIVTurn + CONFIG.declareDeadline) killFaction(s, P, 'history passed you by');
  if (s.actIVOpen && P.acclaimed && !P.ownsProvince) killFaction(s, P, 'history passed you by');
  if (!ownedLegions(s, 'player').length) killFaction(s, P, P.ownsProvince ? 'army destroyed' : 'recalled');
  for (const f of Object.values(s.factions)) {
    if (!f.alive || f.kind === 'state' || f.kind === 'player') continue;
    const legs = ownedLegions(s, f.id).length;
    if (legs === 0) {
      if (f.kind === 'hist' && !s.actIVOpen) {
        if (f.zeroSince < 0) { f.zeroSince = s.turn; s.stats.histZeroBeforeIV++; }
        if (s.turn - f.zeroSince >= 2) { newLegion(s, { station: f.base, loc: f.base, group: GROUP_OF_PROVINCE[f.base] || 'italy', exp: 0.55, owner: f.id, loyalty: 60, levy: true }); f.zeroSince = -1; s.stats.anchorSaves++; }
      } else if (!ownedProvinces(s, f.id).length || f.kind !== 'hist') killFaction(s, f, 'eliminated');
    } else f.zeroSince = -1;
  }
  s.stats.maxLegions = Math.max(s.stats.maxLegions, ownedLegions(s, 'player').length);
  if (s.turn >= CONFIG.maxTurns - 1 && !s.outcome) s.outcome = { win: false, cause: 'out of time', turn: s.turn };
}

// ---------------------------------------------------------------- turn

export function step(s) {
  s.R = rngs(s);
  history(s);
  for (const t of s.spawnAt) if (t === s.turn && !s.actIVOpen) spawnProcedural(s);
  economy(s);
  loyalty(s);
  frontiers(s);
  raids(s);
  for (const F of Object.values(s.factions)) if (F.kind !== "state" && F.alive) factionTurn(s, F);
  movement(s);
  mutinies(s);
  rome(s);
  hold(s);
  checks(s);
  for (const l of Object.values(s.legions)) l.loyalty = Math.max(0, Math.min(100, l.loyalty));
  if (s.emperor && !s.factions[s.emperor]?.alive) s.emperor = null;
  s.turn++;
  return s;
}

export function play(seed, opts) {
  const s = init(seed, opts);
  while (!s.outcome && s.turn < CONFIG.maxTurns) step(s);
  if (!s.outcome) s.outcome = { win: false, cause: 'out of time', turn: s.turn };
  return s;
}
