import { GROUP_OF_PROVINCE } from '../data/world.js';
import { CONFIG, ROAD_STAT } from './config.js';
import { ITALY, distance } from './graph.js';
import { money, hostile, killFaction, log, newLegion, ownedLegions, ownedProvinces, takeLegion } from './core.js';
import { history } from './history.js';
import { loyalty } from './world.js';

export function rome(s) {
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
export function hold(s) {
  const E = s.emperor && s.factions[s.emperor];
  if (!E || !E.alive || !s.actIVOpen || s.prov.ROM.owner !== E.id) return;
  const r = s.R.events;
  const italyLegs = Object.values(s.legions).filter((l) => ITALY.includes(l.loc) && l.owner === E.id).length;
  // spending: the dole and the Senate (a human spends by choice: actions.js)
  if (!(E.kind === 'player' && s.opts.human)) {
  if (s.romeUnrest > 40 && E.treasury > 400) { money(s, E, -150, 'grain dole'); s.romeUnrest = Math.max(0, s.romeUnrest - 15); }
  if (E.road === 'wealth' && E.legit < 50 && E.treasury > 600) { money(s, E, -200, 'senators'); E.legit += 4; }
  if (E.road === 'politics' && E.legit < 70 && E.treasury > 300) { money(s, E, -80, 'consulships'); E.legit += 2; } // consulships for friends
  if (E.road === 'charisma' && E.legit < 60 && E.treasury > 250) { money(s, E, -100, 'games'); E.legit += 2; s.romeUnrest = Math.max(0, s.romeUnrest - 10); } // games and largesse
  }
  // conspiracy
  const plot = Math.max(0, (40 - E.legit) / 120 + s.romeUnrest / 500) * s.diff.plotMult * Math.max(0.6, 1 - 0.05 * italyLegs) * (1 - 0.05 * E.stats[ROAD_STAT[E.road]]);
  E.whispers = plot * (E.informers === s.turn ? 0.5 : 1);
  if (r.chance(E.whispers)) {
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

export function checks(s) {
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
