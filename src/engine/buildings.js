import { levyGoodMult, buildGoodMult, gamesGoodMult } from './trade.js';
import { CONFIG } from './config.js';
// Buildings and governors: provincial management. The same rules for the
// player and every rival; every effect is wired into the engine below and
// measured by `npm run measure:buildings` (sim/ablations/buildings.js) (an effect nobody wants gets cut).
import { BUILDINGS, SLOTS, TRAITS, GAMES_COST } from '../data/buildings.js';
import { PROV, ADJ } from './graph.js';
import { money, log, newFaction, ownedProvinces, ownedLegions, strengthOf } from './core.js';
import { addMember, appointGovernor, governorOf, localMen, postOf, removeMember } from './circle.js';

export const has = (P, id) => !!P.buildings && P.buildings.includes(id);

export function canBuild(s, F, pid, bid) {
  const P = s.prov[pid], B = BUILDINGS[bid], d = PROV[pid];
  if (!B) return 'Unknown work';
  if (s.opts.noBuilding && s.opts.noBuilding.includes(bid)) return 'Not in this measurement';
  if (P.owner !== F.id) return 'Not your province';
  if (B.onlyAt && !B.onlyAt.includes(pid)) return 'Rome struck coin only at Lugdunum, Rome, Antioch, Alexandria and in Spain';
  if (B.needsCoast && !ADJ[pid].some((e) => e.kind === 'sea')) return 'No coast';
  if (B.needsFrontier && !d.frontier) return 'No frontier to watch';
  if (has(P, bid)) return 'Already built';
  if ((P.buildings || []).length >= SLOTS[d.tier]) return 'No room: every site is used';
  if (P.building) return 'One work at a time: wait for the current one';
  if (P.unrest >= 70) return 'Too unruly to build';
  if (F.treasury < buildCost(s, F.id, bid)) return 'Not enough money';
  return '';
}

export function build(s, F, pid, bid) {
  const why = canBuild(s, F, pid, bid);
  if (why) return { error: why };
  const B = BUILDINGS[bid];
  money(s, F, -buildCost(s, F.id, bid), 'building: ' + B.name);
  s.prov[pid].building = { id: bid, done: s.turn + B.months };
  return { ok: true };
}

// monthly: works finish, upkeep is paid, slow effects apply
export function buildingsTurn(s) {
  for (const P of Object.values(s.prov)) {
    if (P.building && P.building.done <= s.turn) {
      (P.buildings = P.buildings || []).push(P.building.id);
      if (P.owner === 'player') log(s, `built ${P.building.id} ${P.id}`, P.id, `${BUILDINGS[P.building.id].name} finished in ${PROV[P.id].name}.`);
      P.building = null;
    }
    const F = s.factions[P.owner];
    if (!F || F.kind === 'state' || !F.alive) continue;
    for (const bid of P.buildings || []) money(s, F, -BUILDINGS[bid].upkeep, 'upkeep');
    if (has(P, 'mint')) F.legit = Math.min(100, F.legit + 0.5);
    // a stone camp with its workshops: legions stationed here refill their ranks
    if (has(P, 'castra')) for (const l of Object.values(s.legions)) if (l.loc === P.id && l.owner === P.owner && !l.army && l.men < 5000) l.men = Math.min(5000, Math.round(l.men * 1.03 + 60));
    if (has(P, 'temple')) F.legit = Math.min(100, F.legit + 0.3);
  }
}

// multipliers and modifiers read by the rest of the engine
export function revenueMult(P) {
  let m = 1;
  if (has(P, 'road')) m += 0.08;
  const t = P.governor?.trait;
  if (t === 'greedy') m += 0.15; else if (t === 'able') m += 0.08; else if (t === 'ambitious') m += 0.05;
  return m;
}
export function revenueFlat(P) { return has(P, 'mint') ? 40 : 0; }
export function unrestDelta(P) {
  let d = 0;
  if (has(P, 'granary')) d -= 1;
  if (has(P, 'temple')) d -= 1;
  const t = P.governor?.trait;
  if (t === 'honest') d -= 1; else if (t === 'greedy') d += 2;
  return d;
}
export function grainBonus(P) { return has(P, 'granary') && PROV[P.id].grain ? 0.5 : 0; }
export function threatMult(s, provinces) { return provinces.some((pid) => has(s.prov[pid], 'limes') && s.prov[pid].owner !== 'state') ? 0.67 : 1; }
export function garrisonMult(P) { return has(P, 'castra') ? 1.5 : 1; }
export function levyMonthsOff(P) { return (has(P, 'dilectus') ? 1 : 0) + (P.governor?.trait === 'able' ? 1 : 0); }
export function levyCostMult(P) { return has(P, 'dilectus') ? 0.75 : 1; }
// what a levy, a work or games cost this faction (works and the market together)
// veterans flock to a soldier's standard: the military road raises legions a quarter cheaper
export function levyCostFor(s, fid, P) { return CONFIG.levyCost * levyCostMult(P) * levyGoodMult(s, fid) * (s.factions[fid]?.road === 'military' ? 0.75 : 1); }
export function buildCost(s, fid, bid) { return Math.round(BUILDINGS[bid].cost * buildGoodMult(s, fid)); }
export function gamesCost(s, fid) { return Math.round(GAMES_COST * gamesGoodMult(s, fid)); }
export function levyExp(P) { return has(P, 'dilectus') ? 0.75 : 0.6; }
export function harbourAt(s, pid) { return has(s.prov[pid], 'harbour'); }

// ---------------------------------------------------------------- governors

// an ambitious governor may claim the province when his master looks weak
export function governorsTurn(s) {
  if (s.actIVOpen) return;
  const r = s.R.events;
  for (const P of Object.values(s.prov)) {
    if (P.governor?.trait !== 'ambitious') continue;
    const F = s.factions[P.owner];
    if (!F || F.kind === 'state' || !F.alive) continue;
    const weak = F.legit < 25 || P.unrest > 50;
    if (!weak || !r.chance(0.04)) continue;
    if (Object.values(s.legions).some((l) => l.loc === P.id && l.owner === F.id)) continue; // legions keep him honest
    const G = newFaction(s, { kind: 'proc', road: 'politics', acclaimed: true, rebel: true, base: P.id, legit: 12, treasury: 150, name: P.governor.name });
    removeMember(s, F, P.governor.cid, null);
    P.owner = G.id; P.governor = null;
    s.stats.procSpawned++;
    log(s, `governor of ${P.id} rebels`, P.id, `${G.name}, your governor of ${PROV[P.id].name}, claims the province for himself.`);
  }
}

// What a work is worth in a province, per 100k of cost and a year's upkeep:
// the judgement a governor on Balance uses (and every rival's governors).
const WANT = {
  wealth: ['road', 'mint', 'granary', 'harbour', 'temple'],
  military: ['castra', 'dilectus', 'limes', 'road'],
  politics: ['temple', 'mint', 'road', 'granary'],
  charisma: ['temple', 'granary', 'road', 'castra'],
};
export function workValue(s, F, P, bid) {
  const d = PROV[P.id], B = BUILDINGS[bid];
  let v = 0;
  if (bid === 'road') v = d.rev * 0.08 * 12;
  if (bid === 'mint') v = 40 * 12 + 30;
  if (bid === 'granary') v = (P.unrest > 15 ? 60 : 20) + (d.grain ? 80 : 0);
  if (bid === 'temple') v = 60 + (F.legit < 40 ? 60 : 0) + (P.unrest > 25 ? 30 : 0);
  if (bid === 'castra') v = (d.tier === 'legion' ? 70 : 20) + (d.frontier ? 30 : 0);
  if (bid === 'limes') v = d.frontier ? Math.max(0, (s.threat[d.frontier] - 25) * 4) : 0;
  if (bid === 'dilectus') v = ['legion', 'grain'].includes(d.tier) && ownedLegions(s, F.id).length < 8 ? 90 : 10;
  if (bid === 'harbour') v = ADJ[P.id].some((e) => e.kind === 'sea') ? 30 + d.grain * 40 : 0;
  v *= (WANT[F.road] || []).includes(bid) ? 1.5 : 1;
  return v / (B.cost + B.upkeep * 12);
}

// Rivals and the measuring bot: a governor from their own circle in every
// province, standing orders that suit their road, a works budget they can afford.
const ROAD_INSTR = { wealth: 'exploit', military: 'fortify', politics: 'balance', charisma: 'balance' };
export function aiProvinces(s, F) {
  if (s.opts.noBuildings) return;
  for (const P of ownedProvinces(s, F.id)) {
    if (!P.governor || !governorOf(s, P)) {
      const men = localMen(s, P.id);
      const pick = men.find((m) => m.trait === 'able' || m.trait === 'honest') || men[0];
      if (pick && addMember(s, F, pick, null)) appointGovernor(s, F, P.id, pick.id);
      else {
        // circle full: a free man of the circle takes it, else a deputy keeps the books
        const free = (F.circle || []).find((m) => !postOf(s, F, m));
        if (free) appointGovernor(s, F, P.id, free.id);
      }
    }
    if (P.governor) P.instr = P.unrest > 55 ? 'pacify' : ROAD_INSTR[F.road] || 'balance';
  }
  const reserve = ownedLegions(s, F.id).reduce((a, l) => a + l.men * 0.0188 * l.payMult, 0) * 3;
  F.worksBudget = F.treasury > reserve + 300 ? 150 : F.treasury > reserve ? 40 : 0;
}

export function holdGames(s, F, pid) {
  const P = s.prov[pid];
  if (P.owner !== F.id) return { error: 'Not your province' };
  if (P.gamesTurn === s.turn) return { error: 'Games already given this month' };
  if (F.treasury < gamesCost(s, F.id)) return { error: 'Not enough money' };
  money(s, F, -gamesCost(s, F.id), 'games');
  P.gamesTurn = s.turn;
  P.unrest = Math.max(0, P.unrest - 20 - F.stats.gratia);
  return { ok: true };
}

void strengthOf;
