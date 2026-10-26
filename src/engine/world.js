import { revenueMult, revenueFlat, grainBonus, threatMult, unrestDelta, has } from './buildings.js';
import { FRONTIERS } from '../data/world.js';
import { BUILDINGS } from '../data/buildings.js';
import { CONFIG } from './config.js';
import { PROV, distance, isWinter } from './graph.js';
import { log, money, cull, debtTotal, hostile, killFaction, legionPower, newFaction, ownedLegions, ownedProvinces, takeLegion } from './core.js';
import { fight } from './combat.js';
import { hold } from './rome.js';

export const TAX_MULT = { light: 0.85, normal: 1, heavy: 1.4, extort: 1.8 };
// One province's revenue a month at a tax level (its current one by default).
export function provinceRevenue(s, P, level) {
  if (P.breachUntil > s.turn) return 0;
  return (PROV[P.id].rev * revenueMult(P) + revenueFlat(P)) * TAX_MULT[level || P.tax || 'normal'] * (P.unrest > 60 ? 0.5 : 1);
}
export function incomeOf(s, F) {
  let inc = 0;
  for (const P of ownedProvinces(s, F.id)) inc += provinceRevenue(s, P);
  if (s.emperor === F.id) for (const P of ownedProvinces(s, 'state')) inc += PROV[P.id].rev * CONFIG.stateShare;
  return inc;
}
export function payOf(s, F) {
  if (F.kind === 'player' && !F.ownsProvince) return 0;
  return ownedLegions(s, F.id).reduce((a, l) => a + legionPay(s, l), 0);
}

export function upkeepOf(s, F) {
  let u = 0;
  for (const P of ownedProvinces(s, F.id)) for (const bid of P.buildings || []) u += BUILDINGS[bid].upkeep;
  return u;
}
// What a month will do to the purse if nothing else happens.
export function balanceOf(s, F) {
  if (F.kind === 'player' && !F.ownsProvince) return CONFIG.legateSalary;
  return incomeOf(s, F) - payOf(s, F) - upkeepOf(s, F) - F.borrowed * CONFIG.interest;
}

export function economy(s) {
  const winter = isWinter(s.turn);
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state') continue;
    money(s, F, incomeOf(s, F), 'revenue');
    // pay: before you hold a province, the state still pays your legion, and
    // you draw a legate's salary
    const legs = ownedLegions(s, F.id);
    if (F.kind === 'player' && !F.ownsProvince) { money(s, F, CONFIG.legateSalary, "legate's salary"); continue; }
    const pay = legs.reduce((a, l) => a + legionPay(s, l), 0);
    money(s, F, -pay, 'pay');
    // legions living off their home province: cheaper, but the farmers notice
    for (const P of ownedProvinces(s, F.id)) if (legs.filter((l) => atHome(s, l)).filter((l) => l.loc === P.id).length >= 2) P.unrest = Math.min(100, P.unrest + 1);
    money(s, F, -F.borrowed * CONFIG.interest, 'interest');
    // debts falling due
    for (const l of legs) {
      if (l.debt > 0 && l.debtDue <= s.turn) {
        if (!F.stingy && F.treasury >= l.debt) { money(s, F, -l.debt, 'promise paid: ' + l.id); l.debt = 0; l.debtDue = -1; l.loyalty += 4; }
        else { l.overdue = true; }
      }
    }
    const credit = F.credit ?? F.stats.opes * CONFIG.creditPerOpes;
    if (F.treasury < 0 && F.borrowed < credit) { const b = Math.min(credit - F.borrowed, -F.treasury); F.borrowed += b; money(s, F, b, 'borrowed'); }
    F.unpaid = F.treasury < 0;
    if (F.kind === 'player') s.stats.debtPeak = Math.max(s.stats.debtPeak, debtTotal(s, F.id) + F.borrowed);
  }
  // Rome's grain
  if (s.emperor) {
    let g = 0;
    for (const P of Object.values(s.prov)) {
      const ships = P.grainPolicy === 'ship' && P.owner !== s.emperor;
      if (P.owner !== s.emperor && P.owner !== 'state' && !ships) continue;
      if (P.grainPolicy === 'hold' && P.owner === s.emperor) continue;
      g += (PROV[P.id].grain + grainBonus(P)) * (winter && !has(P, 'harbour') ? 0.5 : 1); // a harbour keeps the grain fleet sailing in winter
      if (ships && PROV[P.id].grain) money(s, s.factions[P.owner], 8 * PROV[P.id].grain, 'grain sold to Rome');
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

// A legion in its own province, held by its own side, lives partly off local
// requisitions: grain, fodder and billets the province gives in kind.
export function atHome(s, l) { return l.loc === l.station && s.prov[l.loc]?.owner === l.owner; }
export function legionPay(s, l) { return l.men * CONFIG.payPerMan * l.payMult * (atHome(s, l) ? CONFIG.homePayMult : 1); }

export function loyalty(s) {
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
    if (!l.army && has(s.prov[l.loc], 'castra') && s.prov[l.loc].owner === l.owner) d += 1;
    if (l.bought) d -= 0.7; // bought men stay bought only while the money lasts
    if (F.legit > 60) d += 0.5;
    l.loyalty = Math.max(0, Math.min(100, l.loyalty + d));
  }
}

export function mutinies(s) {
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
export function raids(s) {
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

export function frontiers(s) {
  for (const [k, f] of Object.entries(FRONTIERS)) {
    const present = Object.values(s.legions).filter((l) => f.provinces.includes(l.loc)).length;
    const deficit = Math.max(0, f.normal - present) / f.normal;
    s.threat[k] += f.base * (0.3 + 2.5 * deficit) * s.diff.frontierMult * threatMult(s, f.provinces) - (deficit === 0 ? 4 : 0);
    s.threat[k] = Math.max(0, Math.min(120, s.threat[k]));
    if (s.threat[k] >= 100) {
      s.threat[k] = 40;
      for (const pid of f.provinces) {
        const P = s.prov[pid];
        P.breachUntil = s.turn + 4;
        P.unrest = Math.min(100, P.unrest + 30);
        const O = s.factions[P.owner];
        if (O.kind !== 'state') O.legit = Math.max(0, O.legit - 8);
        if (O.kind === 'player') { s.stats.breaches++; log(s, `breach ${pid}`, pid, `The frontier breaks in ${PROV[pid].name}. Raiders burn the farms; no taxes will come from there for months.`); }
        for (const l of Object.values(s.legions)) if (l.loc === pid) l.men = Math.round(l.men * 0.85);
        if (!Object.values(s.legions).some((l) => l.loc === pid && l.owner === P.owner)) P.owner = 'state';
      }
      cull(s);
    }
  }
  for (const P of Object.values(s.prov)) {
    if (P.owner === 'state') { P.unrest = Math.max(0, P.unrest - 2); continue; }
    P.unrest += (P.tax === 'heavy' ? 3 : P.tax === 'extort' ? 9 : P.tax === 'light' ? -5 : -3) + unrestDelta(P);
    P.unrest = Math.max(0, Math.min(100, P.unrest));
    if (P.unrest > 85 && !Object.values(s.legions).some((l) => l.loc === P.id && l.owner === P.owner)) {
      const O = s.factions[P.owner];
      O.legit = Math.max(0, O.legit - 5);
      P.owner = 'state'; P.aux = PROV[P.id].aux; P.unrest = 40;
    }
  }
}
