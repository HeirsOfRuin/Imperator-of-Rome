import { levyGoodExp, smallFightGoodMult } from './trade.js';
import { garrisonMult, levyExp } from './buildings.js';
import { GROUP_OF_PROVINCE, BACKGROUND } from '../data/world.js';
import { streamFor } from './rng.js';
import { CLIENTS } from '../data/people.js';
import { CONFIG, ROAD_STAT, TOWN_MEN } from './config.js';
import { ADJ, PROV, isWinter, route, distance } from './graph.js';
import { LEGIONS } from '../data/world.js';
import { loyalty } from './world.js';

const LEGION_NAMES = {
  'II-Aug': 'II Augusta', 'IX-Hisp': 'IX Hispana', 'XX-VV': 'XX Valeria Victrix', 'I-Germ': 'I Germanica', 'V-Alaud': 'V Alaudae',
  'XV-Prim': 'XV Primigenia', 'XVI-Gall': 'XVI Gallica', 'IV-Mac': 'IV Macedonica', 'XXI-Rap': 'XXI Rapax', 'XXII-Prim': 'XXII Primigenia',
  'VI-Vic': 'VI Victrix', 'X-Gem': 'X Gemina', 'XIII-Gem': 'XIII Gemina', 'XI-Claud': 'XI Claudia', 'XIV-Gem': 'XIV Gemina',
  'VII-Claud': 'VII Claudia', 'VIII-Aug': 'VIII Augusta', 'III-Gall': 'III Gallica', 'IV-Scyth': 'IV Scythica', 'VI-Ferr': 'VI Ferrata',
  'XII-Fulm': 'XII Fulminata', 'V-Mac': 'V Macedonica', 'X-Fret': 'X Fretensis', 'XV-Apoll': 'XV Apollinaris', 'III-Cyr': 'III Cyrenaica',
  'XXII-Deiot': 'XXII Deiotariana', 'III-Aug': 'III Augusta', 'I-Ital': 'I Italica', 'VII-Galb': 'VII Galbiana', 'I-Macr': 'I Macriana',
  'I-Adiut': 'I Adiutrix', PRAET: 'The Praetorian Guard',
};
export function legionName(l) {
  if (LEGION_NAMES[l.id]) return LEGION_NAMES[l.id];
  if (l.client) { const c = CLIENTS.find((x) => x.id === l.client); return c ? `Men of ${c.name.replace(/^the /, 'the ')}` : 'Allied troops'; }
  if (l.group === 'gaul') return 'Gallic levy';
  return `New legion of ${PROV[l.station]?.name || 'the provinces'}`;
}

export const KNOWN_NAMES = {
  state: 'the Senate', player: 'you', barbarians: 'the barbarians',
  galba: 'Servius Sulpicius Galba', otho: 'Marcus Salvius Otho', vitellius: 'Aulus Vitellius', vespasian: 'Titus Flavius Vespasianus',
  vindex: 'Gaius Julius Vindex', macer: 'Lucius Clodius Macer', nymphidius: 'Nymphidius Sabinus', capito: 'Fonteius Capito', albinus: 'Lucceius Albinus',
};
const PRAENOMINA = ['Gaius', 'Lucius', 'Marcus', 'Publius', 'Quintus', 'Titus', 'Gnaeus', 'Sextus', 'Aulus', 'Decimus'];
const NOMINA = ['Antonius', 'Caecilius', 'Cornelius', 'Fabius', 'Licinius', 'Pompeius', 'Valerius', 'Vettius', 'Pomponius', 'Annius', 'Didius', 'Hordeonius', 'Vipstanus', 'Tettius', 'Numisius', 'Dillius', 'Plotius', 'Arrius', 'Herennius', 'Vibius'];
// A procedural legate's name, from his id alone (draws nothing from the RNG).
export function legateName(id) {
  let h = 0x811c9dc5; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return `${PRAENOMINA[h % PRAENOMINA.length]} ${NOMINA[(h >>> 8) % NOMINA.length]}`;
}

export function newFaction(s, f) {
  const id = f.id || `F${s.nextId++}`;
  const F = {
    id, name: f.name || KNOWN_NAMES[id] || legateName(id), kind: f.kind, road: f.road || 'military',
    stats: { opes: 2, virtus: 2, auct: 2, gratia: 2, ...(f.stats || {}) },
    legit: f.legit ?? 20, treasury: f.treasury ?? 200, borrowed: 0,
    acclaimed: !!f.acclaimed, alive: true, anchored: !!f.anchored, base: f.base,
    target: f.target || 'local', stingy: !!f.stingy, patience: f.patience || 0,
    comrades: f.comrades || null, allies: Object.fromEntries((f.allies || []).map((x) => [x, true])),
    leaderArmy: null, levy: null, rebel: !!f.rebel, bornTurn: s.turn, zeroSince: -1,
    allowed: f.allowed || null, declareAt: f.declareAt ?? 4,
  };
  s.factions[F.id] = F;
  return F;
}

export function newLegion(s, l) {
  const L = {
    id: l.id || `L${s.nextId++}`, station: l.station, group: l.group, men: l.men ?? CONFIG.legionMen,
    exp: l.exp ?? 1.0, owner: l.owner, loyalty: l.loyalty ?? 60, loc: l.loc ?? l.station, army: null,
    debt: 0, debtDue: -1, payMult: l.payMult ?? 1, standAside: {}, levy: !!l.levy,
  };
  if (l.client) L.client = l.client;
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

export const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

export function townsFor(p) {
  const men = TOWN_MEN[p.tier] || 0;
  if (!men || p.id === 'ROM') return [];
  const n = p.tier === 'grain' || p.tier === 'italy' || p.rev >= 140 ? 2 : 1;
  return Array.from({ length: n }, (_, i) => ({ men: men - i * 300, base: men - i * 300, standAside: {} }));
}

export function rngs(s) {
  return {
    combat: streamFor(s.seed, s.turn, 'combat'), ai: streamFor(s.seed, s.turn, 'ai'),
    events: streamFor(s.seed, s.turn, 'events'), spawn: streamFor(s.seed, s.turn, 'spawn'),
  };
}

// msg: the trace line for tools. text: the dispatch a human reads (none = not news).
export function log(s, msg, loc, text) {
  if (s.opts.trace) s.events.push(`t${s.turn} ${msg}`);
  if (s.opts.human && text !== null) s.dispatches.push({ t: s.turn, loc: loc || null, text: text || msg });
}
export function who(s, id) { return id === 'player' ? 'You' : s.factions[id]?.name || id; }

export const ownedLegions = (s, fid) => Object.values(s.legions).filter((l) => l.owner === fid);

export const ownedProvinces = (s, fid) => Object.values(s.prov).filter((p) => p.owner === fid);

export function legionPower(s, l) { return l.men * l.exp * (0.6 + 0.4 * l.loyalty / 100); }

export function hostile(s, a, b) {
  if (a === b) return false;
  const A = s.factions[a], B = s.factions[b];
  if (!A || !B) return false;
  if (A.allies[b] || B.allies[a]) return false;
  // in Act I your legion is still the Senate's in everyone's eyes
  if (A.kind === 'player' && !A.rebel && !A.acclaimed) return b !== 'state' && hostile(s, 'state', b);
  if (B.kind === 'player' && !B.rebel && !B.acclaimed) return a !== 'state' && hostile(s, a, 'state');
  if (s.peace && s.peace[a < b ? a + '|' + b : b + '|' + a]) return false;
  if (a === 'state') return s.emperor !== b && (B.rebel || B.acclaimed);
  if (b === 'state') return s.emperor !== a && (A.rebel || A.acclaimed);
  return true;
}

export function armyPower(s, A) {
  const F = s.factions[A.owner];
  let p = 0;
  for (const id of A.legions) p += legionPower(s, s.legions[id]);
  const g = A.general && (F.generals || []).find((x) => x.id === A.general);
  const lead = A.id === F.leaderArmy ? 1 + 0.06 * F.stats.virtus : g ? 1 + 0.04 * g.skill : 1 + 0.02 * F.stats.virtus;
  return p * lead * (F.kind === 'player' ? s.diff.playerEdge : 1);
}

export function bodiesAt(s, fid, pid) {
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

export function bodyMen(s, b) {
  if (b.kind === 'town' || b.kind === 'raid') return (b.town || b.raid).men;
  if (b.kind === 'army') return b.army.legions.reduce((a, id) => a + s.legions[id].men, 0);
  if (b.kind === 'legion') return b.legion.men;
  return b.prov.aux;
}

export function bodyPower(s, b) {
  if (b.kind === 'town') return b.town.men * 0.45 * 1.7; // militia behind walls
  if (b.kind === 'raid') return b.raid.men * 0.75;
  if (b.kind === 'army') return armyPower(s, b.army);
  if (b.kind === 'legion') return legionPower(s, b.legion) * 1.1;
  return b.prov.aux * 0.7 * 1.2 * garrisonMult(b.prov);
}

export function bodyLoyalty(s, b) {
  const oath = s.turn < 3 && ((b.kind === 'legion' && b.legion.owner === 'state') || (b.kind === 'aux' && b.prov.owner === 'state')) ? 20 : 0;
  return Math.min(100, rawLoyalty(s, b) + oath);
}

export function rawLoyalty(s, b) {
  if (b.kind === 'town') return 50 + Math.min(20, s.factions[b.prov.owner].legit / 4);
  if (b.kind === 'raid') return 100;
  if (b.kind === 'army') return b.army.legions.reduce((a, id) => a + s.legions[id].loyalty, 0) / b.army.legions.length;
  if (b.kind === 'legion') return b.legion.loyalty;
  return 55;
}

export function bodyGroup(s, b) {
  if (b.kind === 'town' || b.kind === 'raid') return null;
  if (b.kind === 'legion') return b.legion.group;
  if (b.kind === 'army') return s.legions[b.army.legions[0]].group;
  return GROUP_OF_PROVINCE[b.prov.id] || null;
}

export function buyCost(s, F, b) {
  return bodyMen(s, b) * CONFIG.buyPerMan * (0.5 + bodyLoyalty(s, b) / 100) / (1 + 0.08 * F.stats.opes);
}

export function negotiateChance(s, F, b, ratio) {
  const kind = F.stats.gratia >= F.stats.auct ? 'appeal' : 'oath';
  const stat = kind === 'appeal' ? F.stats.gratia : F.stats.auct;
  let p = 0.08 + 0.065 * stat + (F.legit - 40) / 220 - (bodyLoyalty(s, b) - 50) / 140 - s.diff.negPenalty;
  if (kind === 'appeal' && F.comrades && bodyGroup(s, b) === F.comrades) p += 0.25;
  if (kind === 'oath' && s.emperor === F.id) p += 0.15;
  if (ratio >= 2) p += 0.1;
  if (b.kind === 'army') p -= 0.15;
  return { p: Math.max(0.02, Math.min(0.9, p)), kind };
}

export function debtTotal(s, fid) { return ownedLegions(s, fid).reduce((a, l) => a + l.debt, 0); }

// The only place money moves. The player's rows go to the ledger, so the
// treasury can always be explained (and a test checks purse == ledger).
export function money(s, F, x, why) {
  F.treasury += x;
  if (F.kind === 'player' && x) s.ledger.push([s.turn, Math.round(x * 100) / 100, why]);
}

export function takeLegion(s, l, fid, loyalty) {
  if (l.army) {
    const A = s.armies[l.army];
    A.legions = A.legions.filter((x) => x !== l.id);
    l.army = null;
  }
  l.owner = fid; l.loyalty = loyalty; l.debt = 0; l.debtDue = -1; l.bought = false;
}

export function removeLegion(s, l) {
  if (l.army) { const A = s.armies[l.army]; A.legions = A.legions.filter((x) => x !== l.id); }
  delete s.legions[l.id];
}

export function setAside(s, F, b, months) {
  if (b.kind === 'town') b.town.standAside[F.id] = s.turn + months;
  if (b.kind === 'legion') b.legion.standAside[F.id] = s.turn + months;
  if (b.kind === 'aux') b.prov.standAside[F.id] = s.turn + months;
}

export function gainBody(s, F, b, loyalty, debt, bought) {
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

export function flipProvince(s, P, fid, keepAux) {
  const old = P.owner;
  P.owner = fid;
  P.unrest = Math.min(100, P.unrest + 10);
  if (!keepAux) P.aux = Math.round(PROV[P.id].aux * 0.4);
  P.standAside = {};
  P.governor = null; P.ownedSince = s.turn;
  seizeChest(s, P, old, fid);
  for (const t of P.towns) { t.men = Math.round(t.base * 0.7); t.standAside = {}; }
  const F = s.factions[fid];
  if (F.kind !== 'state') F.rebel = true;
  if (F.kind === 'player') F.ownsProvince = true;
  // Praetorians follow Rome only by encounter, never automatically
  void old;
}

export function cull(s) {
  for (const l of Object.values(s.legions)) if (l.men < 1000) removeLegion(s, l);
}

export function retreatLegion(s, l) {
  const F = s.factions[l.owner];
  if (F.kind === 'player' && !F.rebel) {
    // still the Senate's man: fall back to a neighbouring loyal province and plot there
    const to = ADJ[l.loc].map((e) => e.to).find((p) => s.prov[p].owner === 'state');
    if (to) { l.loc = to; l.station = to; F.base = to; log(s, `player falls back to ${to}`, to, `Your legion falls back to ${PROV[to].name}. You will have to win men there instead.`); return; }
  }
  const opts = ADJ[l.loc].map((e) => e.to).filter((p) => s.prov[p].owner === l.owner);
  if (opts.length) { if (l.army) takeLegion(s, l, l.owner, l.loyalty); l.loc = opts[0]; return; }
  if (F.anchored && F.base && !s.actIVOpen) { if (l.army) takeLegion(s, l, l.owner, l.loyalty); l.loc = F.base; return; }
  removeLegion(s, l);
}

export function killFaction(s, F, cause) {
  if (!F.alive) return;
  log(s, `DEAD ${F.id}: ${cause}`, null, F.kind === 'player' ? null : cause === 'eliminated' ? `${F.name} has lost his last legion. His cause is finished.` : cause === 'death' ? `${F.name} has fallen in battle.` : `${F.name} is dead: ${cause}.`);
  F.alive = false;
  if (s.emperor === F.id) s.emperor = null;
  if (F.kind === 'player') { s.outcome = { win: false, cause, turn: s.turn }; return; }
  // its legions and provinces go back to the state (the governors decide later)
  for (const l of ownedLegions(s, F.id)) takeLegion(s, l, 'state', 40);
  for (const p of ownedProvinces(s, F.id)) { p.owner = 'state'; }
  for (const A of Object.values(s.armies)) if (A.owner === F.id) delete s.armies[A.id];
  if (s.emperor === F.id) s.emperor = null;
}

export function levyLegion(s, F, pid, id) {
  newLegion(s, { id, station: pid, group: GROUP_OF_PROVINCE[pid] || 'italy', exp: levyExp(s.prov[pid]) + levyGoodExp(s, F.id), owner: F.id, loyalty: 62, levy: true });
}

export function makeArmy(s, owner, loc, legionIds, dest) {
  const A = { id: `A${s.nextId++}`, owner, loc, legions: [], path: [], edgeLeft: 0, dest: null, from: loc, bypassed: 0 };
  for (const id of legionIds) { const l = s.legions[id]; if (l.army) takeLegion(s, l, l.owner, l.loyalty); l.army = A.id; l.loc = loc; A.legions.push(id); }
  s.armies[A.id] = A;
  if (dest) setDest(s, A, dest);
  return A;
}

export function setDest(s, A, dest) {
  if (A.dest === dest && A.path.length) return;
  A.dest = dest;
  A.path = dest === A.loc ? [] : route(A.loc, dest, isWinter(s.turn));
  A.edgeLeft = 0;
}

export function strengthOf(s, fid) { return ownedLegions(s, fid).reduce((a, l) => a + legionPower(s, l), 0); }

export function strongestFaction(s) {
  let best = null, bs = -1;
  for (const f of Object.values(s.factions)) if (f.alive && f.kind !== 'state') { const x = strengthOf(s, f.id); if (x > bs) { bs = x; best = f.id; } }
  return best;
}

// The provincial chest: a province taken from the Senate gives up its
// treasury, and the pay chest kept for the legions stationed there. It refills
// over a year, so a province changing hands twice does not pay twice.
export function chestOf(s, P) {
  const full = PROV[P.id].rev * 1.5 + 180 * LEGIONS.filter((l) => l.station === P.id).length;
  const since = P.chestTaken == null ? 99 : s.turn - P.chestTaken;
  return Math.round(full * Math.min(1, since / 12));
}
function seizeChest(s, P, old, fid) {
  const F = s.factions[fid];
  if (old !== 'state' || !F || F.kind === 'state') return;
  const x = chestOf(s, P);
  P.chestTaken = s.turn;
  if (x > 0) money(s, F, x, 'provincial treasury: ' + P.id);
}

// Which act the player is in (the screens, the story and the report agree).
export function actOf(s) {
  const P = s.factions.player;
  return s.actIVOpen ? 4 : !P.ownsProvince ? 1 : !P.acclaimed ? 2 : 3;
}

// The nearest province a faction holds with no hostile army in it.
export function nearestHeld(s, fid, from, avoid) {
  let best = null, bd = Infinity;
  for (const P of Object.values(s.prov)) {
    if (P.owner !== fid || P.id === avoid) continue;
    if (Object.values(s.armies).some((x) => x.loc === P.id && x.legions.length && hostile(s, fid, x.owner))) continue;
    const d = distance(from, P.id);
    if (d < bd) { bd = d; best = P.id; }
  }
  return best;
}

// An army falls back: one stage now, then on to the nearest province it holds.
// loss: the share of men the rearguard costs.
export function fallBack(s, A, loss = 0) {
  const fid = A.owner;
  const target = nearestHeld(s, fid, A.loc, A.loc);
  let step = null;
  if (A.from && A.from !== A.loc && !Object.values(s.armies).some((x) => x.loc === A.from && x.legions.length && hostile(s, fid, x.owner))) step = A.from;
  else if (target) step = route(A.loc, target, isWinter(s.turn))[0] || null;
  if (!step) step = ADJ[A.loc].map((e) => e.to).find((p) => !Object.values(s.armies).some((x) => x.loc === p && x.legions.length && hostile(s, fid, x.owner))) || null;
  for (const id of A.legions) { const l = s.legions[id]; if (l && loss) l.men = Math.round(l.men * (1 - loss)); }
  A.path = []; A.dest = null; A.edgeLeft = 0;
  const left = A.loc;
  if (step) { A.from = A.loc; A.loc = step; for (const id of A.legions) if (s.legions[id]) s.legions[id].loc = step; }
  const home = nearestHeld(s, fid, A.loc, left);
  if (home && home !== A.loc) setDest(s, A, home);
  cull(s);
  return A.loc;
}
