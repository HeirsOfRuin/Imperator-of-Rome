// Peoples beyond the frontiers (docs/FRAME-DEPTH.md): pay them to keep quiet,
// pay them to rise against whoever holds the frontier, or (Parthia) make a
// friend of the King of Kings. They act on a frontier's threat (world.js
// frontiers), so they hurt everyone who holds that frontier, you included.
import { PEOPLES } from '../data/powers.js';
import { FRONTIERS } from '../data/world.js';
import { distance } from './graph.js';
import { log, money, ownedProvinces, strengthOf, who } from './core.js';
import { addFavour } from './senate.js';
import { adjustStanding } from './diplomacy.js';

export const SUBSIDY_MONTHS = 6;
export const INCITE_MONTHS = 4;
export const INCITE_JUMP = 30;
export const DISCOVERY = 0.35;

export function initForeign(s) { if (!s.foreign) s.foreign = { subsidy: {}, incited: {}, parthia: null }; return s.foreign; }

const holdsOn = (s, fid, fr) => FRONTIERS[fr].provinces.some((pid) => s.prov[pid].owner === fid);
const nearTo = (s, fid, fr, d) => ownedProvinces(s, fid).some((P) => FRONTIERS[fr].provinces.some((pid) => distance(P.id, pid) <= d));

// How a frontier's threat grows this month (multiplier on the monthly rise).
export function threatGrowthMult(s, fr) {
  const X = initForeign(s);
  let m = 1;
  if ((X.subsidy[fr]?.until ?? -1) > s.turn) m *= 0.35;
  if ((X.incited[fr] ?? -1) > s.turn) m *= 1.8;
  if (fr === 'east' && X.parthia && s.prov.SYR.owner === X.parthia) m *= 0.3;
  return m;
}

export function peopleBlocked(s, F, p, what) {
  const X = initForeign(s);
  if (what === 'subsidy') {
    if (!holdsOn(s, F.id, p.frontier)) return 'You hold no province on that frontier';
    if ((X.subsidy[p.frontier]?.until ?? -1) > s.turn) return 'Already paid for';
    if (F.treasury < p.subsidy) return 'Not enough money';
    return '';
  }
  if (what === 'incite') {
    if (!F.rebel) return 'Only a rebel deals with barbarians against Romans';
    if (!nearTo(s, F.id, p.frontier, 2)) return 'Too far: your envoys cannot reach them';
    if ((X.incited[p.frontier] ?? -1) > s.turn) return 'They are already up in arms';
    if (!FRONTIERS[p.frontier].provinces.some((pid) => s.prov[pid].owner !== F.id && s.prov[pid].owner !== 'state')) return 'No rival holds that frontier';
    if (F.treasury < p.incite) return 'Not enough money';
    return '';
  }
  if (what === 'treaty') {
    if (!p.treaty) return 'They make no treaties';
    if (X.parthia === F.id) return 'Already friends';
    if (s.prov.SYR.owner !== F.id) return 'Only for whoever holds Syria';
    if (F.treasury < p.treaty) return 'Not enough money';
    return '';
  }
  return 'Unknown';
}

export function dealWith(s, F, pid, what) {
  const p = PEOPLES.find((x) => x.id === pid);
  if (!p) return { error: 'No such people' };
  const why = peopleBlocked(s, F, p, what);
  if (why) return { error: why };
  const X = initForeign(s);
  if (what === 'subsidy') {
    money(s, F, -p.subsidy, 'subsidy to ' + p.id);
    X.subsidy[p.frontier] = { by: F.id, until: s.turn + SUBSIDY_MONTHS };
    if (F.kind === 'player') s.stats.subsidies = (s.stats.subsidies || 0) + 1;
    s.stats.subsidiesAll = (s.stats.subsidiesAll || 0) + 1;
    log(s, `subsidy ${p.id} by ${F.id}`, FRONTIERS[p.frontier].provinces[0], F.kind === 'player' ? `Gold goes across the frontier to ${p.name}. They will be quiet for half a year.` : null);
    return { ok: true };
  }
  if (what === 'incite') {
    money(s, F, -p.incite, 'gold to ' + p.id);
    X.incited[p.frontier] = s.turn + INCITE_MONTHS;
    s.threat[p.frontier] = Math.min(120, s.threat[p.frontier] + INCITE_JUMP);
    if (F.kind === 'player') s.stats.incited = (s.stats.incited || 0) + 1;
    s.stats.incitesAll = (s.stats.incitesAll || 0) + 1;
    const found = s.R.events.chance(DISCOVERY);
    if (found) {
      F.legit = Math.max(0, F.legit - 6);
      addFavour(s, F.id, -10);
      for (const pr of FRONTIERS[p.frontier].provinces) { const O = s.prov[pr].owner; if (O !== F.id && O !== 'state') adjustStanding(s, F.id, O, -30); }
      log(s, `incite found ${F.id} ${p.id}`, FRONTIERS[p.frontier].provinces[0], `It is known in Rome that ${who(s, F.id).replace('You', 'you')} paid ${p.name} to rise against Romans. The Senate is appalled.`);
    } else log(s, `incite ${F.id} ${p.id}`, FRONTIERS[p.frontier].provinces[0], F.kind === 'player' ? `${p.name.charAt(0).toUpperCase() + p.name.slice(1)} take your gold. The frontier will burn.` : null);
    return { ok: true, found };
  }
  if (what === 'treaty') {
    money(s, F, -p.treaty, 'gifts to Vologases');
    X.parthia = F.id;
    F.legit = Math.min(100, F.legit + 3);
    log(s, `parthia friends ${F.id}`, 'SYR', `Vologases sends envoys and gifts to ${who(s, F.id).replace('You', 'you')}: friendship, and the caravans of the East.`);
    return { ok: true };
  }
  return { error: 'Unknown' };
}

// Monthly: the friendship ends if Syria changes hands; rivals use the peoples.
export function foreignTurn(s) {
  const X = initForeign(s);
  if (X.parthia && (!s.factions[X.parthia]?.alive || s.prov.SYR.owner !== X.parthia)) X.parthia = null;
  if (s.opts.noForeign) return;
  const r = s.R.ai;
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian' || (F.kind === 'player' && s.opts.human)) continue;
    aiForeign(s, F, r);
  }
}

export function aiForeign(s, F, r) {
  for (const p of PEOPLES) {
    if (s.threat[p.frontier] > 70 && F.treasury > p.subsidy * 3 && !peopleBlocked(s, F, p, 'subsidy')) dealWith(s, F, p.id, 'subsidy');
    if (p.treaty && F.treasury > p.treaty * 2.5 && !peopleBlocked(s, F, p, 'treaty')) dealWith(s, F, p.id, 'treaty');
  }
  if (F.kind === 'player') return; // the measurement bot does not set barbarians on Romans
  // rivals with gold to spare set the barbarians on the strongest claimant's frontier
  if (F.treasury > 500 && r.chance(0.05 * s.diff.aiAggr)) {
    let best = null, bs = 0;
    for (const p of PEOPLES) {
      if (peopleBlocked(s, F, p, 'incite')) continue;
      const holders = FRONTIERS[p.frontier].provinces.map((pid) => s.prov[pid].owner).filter((o) => o !== F.id && o !== 'state');
      const st = Math.max(0, ...holders.map((o) => strengthOf(s, o)));
      if (st > bs) { bs = st; best = p; }
    }
    if (best && bs > strengthOf(s, F.id)) dealWith(s, F, best.id, 'incite');
  }
}

export function peoplesView(s, F) {
  const X = initForeign(s);
  return PEOPLES.map((p) => ({
    id: p.id, name: p.name, note: p.note, frontier: p.frontier, threat: Math.round(s.threat[p.frontier]),
    provinces: FRONTIERS[p.frontier].provinces, holders: [...new Set(FRONTIERS[p.frontier].provinces.map((pid) => s.factions[s.prov[pid].owner]?.name))],
    subsidy: p.subsidy, incite: p.incite, treaty: p.treaty || null,
    subsidised: (X.subsidy[p.frontier]?.until ?? -1) > s.turn ? { by: who(s, X.subsidy[p.frontier].by), until: X.subsidy[p.frontier].until } : null,
    incited: (X.incited[p.frontier] ?? -1) > s.turn, friend: p.treaty ? (X.parthia ? who(s, X.parthia) : null) : null,
    why: { subsidy: peopleBlocked(s, F, p, 'subsidy'), incite: peopleBlocked(s, F, p, 'incite'), treaty: p.treaty ? peopleBlocked(s, F, p, 'treaty') : 'No treaty' },
  }));
}
