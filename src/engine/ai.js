import { addGeneral, mergeColumns } from './generals.js';
import { legionPay } from './world.js';
import { aiProvinces, levyCostFor, levyMonthsOff } from './buildings.js';
import { CONFIG } from './config.js';
import { ADJ, ITALY, PROV, distance, isWinter, route } from './graph.js';
import { who, money, armyPower, flipProvince, hostile, killFaction, legionPower, levyLegion, log, makeArmy, ownedLegions, ownedProvinces, setDest, strengthOf, strongestFaction } from './core.js';
import { resolveEncounter } from './combat.js';
import { rome } from './rome.js';

export function factionTurn(s, F) {
  if (!F.alive) return;
  if (F.kind === 'player' && s.opts.human) { humanUpkeep(s, F); return; }
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
  const reserve = legs.reduce((a, l) => a + legionPay(s, l), 0) * 2;
  const levyWant = F.road === 'military' ? 14 : 5;
  if (!F.levy && legs.length < levyWant && F.treasury > CONFIG.levyCost + reserve) {
    const at = provs.find((p) => ['legion', 'grain'].includes(PROV[p.id].tier) && p.unrest < 60) || provs.find((p) => PROV[p.id].tier !== 'proc' && p.unrest < 70);
    if (at) { money(s, F, -levyCostFor(s, F.id, at), 'levy'); F.levy = { at: at.id, done: s.turn + CONFIG.levyMonths - (F.road === 'military' ? 1 : 0) - (at.id === 'AFR' ? 1 : 0) - levyMonthsOff(at) }; }
  }
  // pay overdue debts if possible (stingy never does)
  if (!F.stingy) for (const l of legs) if (l.overdue && l.debt > 0 && F.treasury - l.debt > reserve / 2) { money(s, F, -l.debt, 'promise paid: ' + l.id); l.debt = 0; l.overdue = false; l.loyalty += 4; }
  // letters (politics road writes two)
  const letters = F.road === 'politics' ? 2 : 1;
  for (let i = 0; i < letters && F.treasury > CONFIG.letterCost && (F.rebel || F.kind !== 'player'); i++) {
    const near = new Set();
    for (const P of provs) for (const e of ADJ[P.id]) near.add(e.to);
    const cand = [...near].filter((pid) => s.prov[pid].owner === 'state' && !Object.values(s.legions).some((l) => l.loc === pid));
    if (!cand.length) break;
    const pid = r.pick(cand);
    money(s, F, -CONFIG.letterCost, 'letter');
    if (F.kind === 'player') s.stats.letters++;
    const p = 0.04 + 0.04 * F.stats.auct + (F.legit - 30) / 400 + (s.emperor === F.id ? 0.1 : 0);
    if (r.chance(Math.max(0.01, p))) { flipProvince(s, s.prov[pid], F.id, true); if (F.kind === 'player') s.stats.gainedBy.letter++; }
  }

  aiProvinces(s, F);
  if (F.kind === 'player') playerStrategy(s, F);
  else rivalStrategy(s, F);
}

export function leaderArmyOf(s, F) {
  let A = F.leaderArmy && s.armies[F.leaderArmy];
  if (A && !A.legions.length) { delete s.armies[A.id]; A = null; F.leaderArmy = null; }
  if (!A && F.kind === 'player' && s.opts.human) {
    // you ride to your largest army and take command; its general stands aside
    const best = Object.values(s.armies).filter((x) => x.owner === F.id && x.legions.length && !x.column).sort((a, b) => b.legions.length - a.legions.length)[0];
    if (best) { best.general = null; F.leaderArmy = best.id; return best; }
  }
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

export function gatherForces(s, F, A, keepFrontier) {
  for (const l of ownedLegions(s, F.id)) {
    if (l.army || l.id === 'PRAET' || l.garrison) continue;
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

export function pickExpansion(s, F, A) {
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

export function rivalStrategy(s, F) {
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
export function expand(s, F, A) {
  if (A.dest && A.dest !== 'ROM' && s.prov[A.dest].owner !== F.id && A.path.length && !ITALY.includes(A.dest)) return;
  const t = pickExpansion(s, F, A);
  if (t) setDest(s, A, t);
  else { A.dest = null; A.path = []; }
}

// Holding Rome but not yet recognised: clear the nearest beatable enemy at the gates.
export function clearGates(s, F, A) {
  if (s.emperor === F.id) return false;
  const myP = armyPower(s, A);
  for (const pid of ['ETR', 'CMP', 'NIT']) {
    const foe = Object.values(s.legions).filter((l) => l.loc === pid && hostile(s, F.id, l.owner) && l.owner !== 'state');
    const p = foe.reduce((a, l) => a + legionPower(s, l), 0);
    if (foe.length && p < myP * 0.7) { setDest(s, A, pid); return true; }
  }
  return false;
}

export function playerStrategy(s, F) {
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
      b = o ? { kind: 'legion', legion: o } : { kind: 'aux', prov: s.prov[here] }; // those standing aside will not defend the governor
    }
    if (b && (b.kind !== 'aux' || s.prov[here].owner !== F.id)) {
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

// A human player's month: what happens on its own (levies finishing, suspicion
// cooling, legions joining the army). Every decision comes from actions.js.
export function humanUpkeep(s, F) {
  if (F.levy && F.levy.done <= s.turn) { levyLegion(s, F, F.levy.at, undefined); log(s, `levy ${F.levy.at}`, F.levy.at, `A new legion is ready in ${PROV[F.levy.at].name}.`); F.levy = null; }
  if (!F.ownsProvince) {
    F.suspicion = Math.max(0, F.suspicion - 3);
    if (F.suspicion >= 100) {
      const here = F.base;
      const mine = ownedLegions(s, F.id).filter((l) => l.loc === here).reduce((a, l) => a + l.men, 0);
      const all = Object.values(s.legions).filter((l) => l.loc === here).reduce((a, l) => a + l.men, 0);
      if (mine / Math.max(1, all) >= 0.74) flipProvince(s, s.prov[here], F.id, true);
      else killFaction(s, F, 'recalled');
    }
    return;
  }
  // no gathering: your legions go where you send them (generals.js)
  if (!F.leaderArmy || !s.armies[F.leaderArmy]) leaderArmyOf(s, F);
  // the province falls: one of your legates swears to you (saves from before generals get him too)
  if (!F.generals) addGeneral(s, F, { id: 'G-first', how: 'when your province falls: a legate of one of your legions' });
  mergeColumns(s, F.id);
}

export function hostileForAct1(s, b) { return b.prov.owner === 'state'; }

export function romeDefence(s, fid) {
  let d = 0;
  for (const l of Object.values(s.legions)) if (ITALY.includes(l.loc) && hostile(s, fid, l.owner)) d += legionPower(s, l);
  return d;
}

export function readyForRome(s, F) {
  const legs = ownedLegions(s, F.id).length;
  const ratio = strengthOf(s, F.id) / Math.max(1, romeDefence(s, F.id));
  if (s.actIVOpen) return ratio >= 0.6 || s.turn >= CONFIG.actIVTurn + 4;
  return legs >= F.declareAt + 2 && ratio >= 1.0 && s.turn >= CONFIG.actIVTurn - 4;
}

export function acclaim(s, F) {
  F.acclaimed = true; F.rebel = true;
  F.legit = Math.min(100, F.legit + 10);
  for (const l of ownedLegions(s, F.id)) {
    l.debt += CONFIG.donativePerLegion;
    l.debtDue = l.debtDue >= 0 ? Math.min(l.debtDue, s.turn + s.diff.dueOnVictory) : s.turn + s.diff.dueOnVictory + 2;
  }
  F.acclaimedTurn = s.turn;
  log(s, `${F.id} acclaimed with ${ownedLegions(s, F.id).length} legions`, F.base, F.kind === 'player' ? null : `${who(s, F.id)} is hailed imperator by his legions.`);
}
