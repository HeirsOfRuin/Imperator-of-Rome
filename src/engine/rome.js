import { addFavour, initSenate, isHostis, plotMult, recognitionLegit } from './senate.js';
import { GROUP_OF_PROVINCE } from '../data/world.js';
import { CONFIG, ROAD_STAT } from './config.js';
import { ITALY, distance } from './graph.js';
import { legionName, who, money, hostile, killFaction, log, newLegion, ownedLegions, ownedProvinces, takeLegion } from './core.js';
import { history } from './history.js';
import { loyalty } from './world.js';

export function rome(s) {
  const owner = s.prov.ROM.owner;
  const O = s.factions[owner];
  const italyHostile = Object.values(s.legions).some((l) => ['ROM', 'ETR', 'CMP'].includes(l.loc) && hostile(s, owner, l.owner) && l.owner !== 'state');
  const terror = O && Object.values(s.legions).filter((l) => ITALY.includes(l.loc) && l.owner === owner).length >= 5;
  // the Senate under your swords revokes its decree; it votes you nothing until next month
  let lifted = false;
  if (O && O.kind !== 'state' && isHostis(s, owner) && !italyHostile) {
    initSenate(s).hostis[owner] = s.turn;
    lifted = true;
    log(s, `hostis lifted ${owner}`, 'ROM', owner === 'player' ? 'With your legions in the city, the Senate finds that you were never a public enemy after all.' : `The Senate revokes its decree against ${O.name}, whose legions are in the city.`);
  }
  if (O && O.kind !== 'state' && O.acclaimed && !italyHostile && !lifted && !isHostis(s, owner) && (O.legit >= recognitionLegit(s, O) || terror) && s.emperor !== owner) {
    s.emperor = owner;
    if (O.legit < recognitionLegit(s, O)) addFavour(s, owner, -20); // a frightened Senate remembers
    log(s, `EMPEROR ${owner}`, 'ROM', owner === 'player' ? 'The Senate meets and votes you the powers of the emperor. The clock of your reign begins.' : `The Senate recognises ${O.name} as emperor.`);
    O.legit = Math.min(100, O.legit + (O.legit >= recognitionLegit(s, O) ? 15 : 5)); // a frightened Senate gives less
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
  // each road keeps its hold its own way, to the same level of legitimacy
  if (E.road === 'wealth' && E.legit < 65 && E.treasury > 600) { money(s, E, -200, 'senators'); E.legit += 4; addFavour(s, E.id, 10); }
  if (E.road === 'politics' && E.legit < 65 && E.treasury > 300) { money(s, E, -80, 'consulships'); E.legit += 2; } // consulships for friends
  if (E.road === 'charisma' && E.legit < 65 && E.treasury > 250) { money(s, E, -100, 'games'); E.legit += 2; s.romeUnrest = Math.max(0, s.romeUnrest - 10); } // games and largesse
  if (E.road === 'military' && E.legit < 65 && E.treasury > 300) triumph(s, E);
  }
  // conspiracy
  const plot = Math.max(0, (40 - E.legit) / 120 + s.romeUnrest / 500) * s.diff.plotMult * Math.max(0.6, 1 - 0.05 * italyLegs) * (1 - 0.05 * E.stats[ROAD_STAT[E.road]]) * (s.opts.noSenate ? 1 : plotMult(s, E.id));
  E.whispers = plot;
  const best = E.stats[ROAD_STAT[E.road]];
  if (E.plot && E.plot.strikes <= s.turn) {
    // the plot strikes: informers paid this month may uncover it first
    const foiled = r.chance(E.informers === s.turn ? 0.6 + 0.04 * best : 0.08);
    if (E.kind === 'player') s.stats.plots = (s.stats.plots || 0) + 1;
    E.plot = null;
    if (foiled) {
      E.legit = Math.min(100, E.legit + 2);
      log(s, `plot foiled ${E.id}`, 'ROM', E.kind === 'player' ? 'Your informers name the conspirators before they can strike. The Senate is very quiet.' : null);
    } else {
      // each road's own strength protects: the guard, the Senate's warnings, the crowd, paid informers
      const kill = 0.45 - 0.045 * best;
      if (r.chance(kill)) { killFaction(s, E, 'murdered by conspirators'); return; }
      E.legit = Math.max(0, E.legit - 3);
      log(s, `plot fails ${E.id}`, 'ROM', E.kind === 'player' ? 'Daggers in the palace corridor. You live; the conspirators die. Rome whispers louder.' : null);
    }
  } else if (!E.plot && r.chance(plot)) {
    // a plot forms; with luck, someone tells you a month ahead
    const warned = r.chance(Math.min(0.95, 0.5 + 0.07 * E.stats.auct + ((E.friends || []).includes('freedman') ? 0.3 : 0)));
    E.plot = { strikes: s.turn + 1, warned };
    if (warned) log(s, `plot forming ${E.id}`, 'ROM', E.kind === 'player' ? 'A freedman brings you names whispered in the Praetorian camp. Something will be tried next month. Informers might uncover it in time.' : null);
    if (warned && !(E.kind === 'player' && s.opts.human) && E.treasury > 160) { money(s, E, -120, 'informers'); E.informers = s.turn + 1; }
  }
  // generals: legions away from the emperor, disloyal, go over to a living rival
  const rivals = Object.values(s.factions).filter((f) => f.alive && f.kind === 'hist' && f.id !== E.id);
  for (const l of ownedLegions(s, E.id)) {
    if (l.army === E.leaderArmy || l.id === 'PRAET' || l.loyalty >= 50) continue;
    if (!r.chance(0.04 * s.diff.generalMult * (1 - 0.08 * E.stats.gratia))) continue;
    const to = rivals.length ? rivals.sort((a, b) => distance(l.loc, a.base) - distance(l.loc, b.base))[0].id : 'state';
    takeLegion(s, l, to, 50);
    if (E.kind === 'player') s.stats.generalsLost = (s.stats.generalsLost || 0) + 1;
    log(s, `general with ${l.id} goes over to ${to}`, l.loc, E.kind === 'player' ? `The legate of ${legionName(l)} goes over to ${who(s, to)}.` : null);
  }
}

// A triumph: the army parades through Rome. Legitimacy, and the legions in Italy
// remember it. The military road's way of keeping the city (also offered to a human).
export const TRIUMPH_COST = 100;
export function triumph(s, E) {
  money(s, E, -TRIUMPH_COST, 'triumph');
  E.legit = Math.min(100, E.legit + 2);
  for (const l of ownedLegions(s, E.id)) if (ITALY.includes(l.loc)) l.loyalty = Math.min(100, l.loyalty + 3);
}

export function checks(s) {
  const P = s.factions.player;
  if (!P.alive) return;
  if (s.actIVOpen && !P.acclaimed && s.turn >= CONFIG.actIVTurn + CONFIG.declareDeadline) killFaction(s, P, 'history passed you by');
  if (s.actIVOpen && P.acclaimed && !P.ownsProvince) killFaction(s, P, 'history passed you by');
  if (!ownedLegions(s, 'player').length) killFaction(s, P, P.ownsProvince ? 'army destroyed' : 'lost your legion');
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
