// The Senate (docs/FRAME-DEPTH.md). Six hundred frightened men who still
// confer the powers of an emperor. Every claimant has its favour; it drifts
// with legitimacy and moves with what a claimant does. One motion a month.
// The same rules for every faction; AI emperors use the Senate against their
// rivals as the player can.
import { SENATE_START } from '../data/powers.js';
import { ITALY } from './graph.js';
import { log, money, ownedLegions, ownedProvinces, strengthOf, who } from './core.js';

const clamp = (x) => Math.max(0, Math.min(100, x));
export const HOSTIS_MONTHS = 12;
export const COURT_COST = 80;
export const EXILES_COST = 100;
export const AERARIUM = 300;

export function initSenate(s) {
  if (!s.senate) s.senate = { favour: {}, hostis: {} };
  return s.senate;
}

export function favour(s, fid) {
  const S = initSenate(s);
  if (S.favour[fid] === undefined) {
    const F = s.factions[fid];
    S.favour[fid] = fid === 'player' ? 22 + 4 * F.stats.auct + ((F.friends || []).includes('senator') ? 10 : 0) : SENATE_START[fid] ?? 25;
  }
  return S.favour[fid];
}
export function addFavour(s, fid, d) {
  const F = s.factions[fid];
  if (!F || F.kind === 'state' || F.kind === 'barbarian') return;
  initSenate(s).favour[fid] = clamp(favour(s, fid) + d);
}
export const isHostis = (s, fid) => (initSenate(s).hostis[fid] ?? -1) > s.turn;

// Recognition: the legitimacy the Senate needs before it votes you the powers.
export function recognitionLegit(s, F) { return F.imperium ? 15 : 25; }

// Plots in Rome: a friendly Senate warns, an angry one sharpens knives.
export function plotMult(s, fid) { const f = favour(s, fid); return f >= 60 ? 0.8 : f < 25 ? 1.3 : 1; }

export function declareHostis(s, by, X) {
  const S = initSenate(s);
  S.hostis[X.id] = s.turn + HOSTIS_MONTHS;
  S.favour[X.id] = 0;
  X.legit = Math.max(0, X.legit - 12);
  for (const l of ownedLegions(s, X.id)) l.loyalty = Math.max(0, l.loyalty - 6);
  for (const P of ownedProvinces(s, X.id)) P.unrest = Math.min(100, P.unrest + 8);
  if (X.kind === 'player') s.stats.hostisOnYou = (s.stats.hostisOnYou || 0) + 1;
  s.stats.hostisAll = (s.stats.hostisAll || 0) + 1;
  log(s, `hostis ${X.id} by ${by.id}`, 'ROM', X.kind === 'player'
    ? `At ${who(s, by.id).replace('You', 'your')}${by.kind === 'player' ? '' : "'s"} bidding, the Senate declares you a public enemy. Your legions hear of it.`
    : `${by.kind === 'player' ? 'At your bidding, the' : 'The'} Senate declares ${X.name} a public enemy of the Roman people.`);
}

// What a motion needs. '' = it can be put.
export function motionBlocked(s, F, m, target) {
  const f = favour(s, F.id);
  if (F.motionTurn === s.turn) return 'One motion a month: the Senate meets on the Kalends';
  const holdsRome = s.prov.ROM.owner === F.id;
  switch (m) {
    case 'decree':
      if (F.decree) return 'Already granted';
      if (!F.acclaimed) return 'You must be proclaimed first';
      if (F.legit < 30) return 'Legitimacy under 30: they will not risk it';
      if (f < 35) return 'Favour under 35';
      if (F.treasury < decreeCost(F)) return 'Not enough money';
      return '';
    case 'imperium':
      if (F.imperium) return 'Already granted';
      if (!F.acclaimed) return 'You must be proclaimed first';
      if (f < 50) return 'Favour under 50';
      return '';
    case 'thanks':
      if (F.recentWin === undefined || s.turn - F.recentWin > 2) return 'No recent victory in a pitched battle';
      if (F.thanked === F.recentWin) return 'Already thanked for that victory';
      if (f < 40) return 'Favour under 40';
      return '';
    case 'hostis': {
      const X = s.factions[target];
      if (!X || !X.alive || X.kind === 'state') return 'No such rival';
      if (!X.acclaimed) return 'He has claimed nothing yet';
      if (isHostis(s, X.id)) return 'Already a public enemy';
      if (!holdsRome && s.emperor !== F.id) return 'The Senate sits in Rome: hold it first';
      if (f < 60) return 'Favour under 60';
      if (f < favour(s, X.id) + 15) return `They favour him too much (${Math.round(favour(s, X.id))})`;
      return '';
    }
    case 'aerarium':
      if (!holdsRome) return 'The treasury of Saturn is in Rome';
      if (F.aerariumTurn !== undefined && s.turn - F.aerariumTurn < 6) return 'Empty until it refills (six months)';
      return '';
    case 'exiles':
      if (F.exiles) return 'Already done';
      if (!ownedProvinces(s, F.id).length) return 'Hold a province first';
      if (F.treasury < EXILES_COST) return 'Not enough money';
      return '';
  }
  return 'Unknown motion';
}

export function decreeCost(F) { return F.road === 'politics' ? 120 : 200; }

export function motion(s, F, m, target) {
  const why = motionBlocked(s, F, m, target);
  if (why) return { error: why };
  F.motionTurn = s.turn;
  if (F.kind === 'player') s.stats.motions = (s.stats.motions || 0) + 1;
  switch (m) {
    case 'decree': money(s, F, -decreeCost(F), "the Senate's decree"); F.decree = true; F.legit = Math.min(100, F.legit + 8); addFavour(s, F.id, 3); break;
    case 'imperium': F.imperium = true; F.legit = Math.min(100, F.legit + 4); addFavour(s, F.id, -5); break;
    case 'thanks': F.thanked = F.recentWin; F.legit = Math.min(100, F.legit + 5); addFavour(s, F.id, 2); break;
    case 'hostis': declareHostis(s, F, s.factions[target]); addFavour(s, F.id, -10); break;
    case 'aerarium': F.aerariumTurn = s.turn; money(s, F, AERARIUM, 'treasury of Saturn'); addFavour(s, F.id, -15); F.legit = Math.max(0, F.legit - 3); break;
    case 'exiles': F.exiles = true; money(s, F, -EXILES_COST, "exiles' estates restored"); addFavour(s, F.id, 12); F.legit = Math.min(100, F.legit + 2); break;
  }
  if (F.kind === 'player') log(s, `motion ${m}`, 'ROM', MOTION_DONE[m]);
  return { ok: true };
}
const MOTION_DONE = {
  decree: 'The Senate names you legate of the Senate and People of Rome.',
  imperium: 'The Senate votes you proconsular imperium: your command is now lawful in their eyes.',
  thanks: 'The Senate decrees a thanksgiving to the gods for your victory.',
  hostis: null, aerarium: 'The treasury of Saturn is opened for you. The senators count what is left.',
  exiles: "Nero's exiles come home and get their estates back. Their families remember who did it.",
};

// Court the Senate: dinners, loans forgiven, a word to the right man. Once a month.
export function courtSenate(s, F) {
  if (F.courtTurn === s.turn) return { error: 'Once a month: more would look like bribery' };
  if (F.treasury < COURT_COST) return { error: 'Not enough money' };
  F.courtTurn = s.turn;
  money(s, F, -COURT_COST, 'senators');
  addFavour(s, F.id, 8 * (1 + 0.1 * F.stats.opes));
  return { ok: true };
}

// Monthly: favour drifts; decrees lapse; the emperor uses his Senate; rivals put motions.
export function senateTurn(s) {
  const S = initSenate(s);
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian') continue;
    const target = 15 + 0.6 * F.legit + (s.emperor === F.id ? 10 : 0) + (F.decree ? 5 : 0) - (isHostis(s, F.id) ? 25 : 0);
    S.favour[F.id] = clamp(favour(s, F.id) + (target - favour(s, F.id)) * 0.08);
    if (isHostis(s, F.id)) for (const l of ownedLegions(s, F.id)) l.loyalty = Math.max(0, l.loyalty - 0.5);
  }
  if (s.opts.noSenate) return;
  // the rivals' own motions, by the same rules as yours (an emperor outlawing a
  // rival is one of them: aiSenate)
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian' || F.kind === 'player') continue;
    aiSenate(s, F);
  }
}

// What a rival (or the measurement bot) does with the Senate.
export function aiSenate(s, F) {
  if (s.opts.noSenate) return;
  const f = favour(s, F.id);
  if (F.courtTurn !== s.turn && f < 45 && F.treasury > 500) courtSenate(s, F);
  for (const m of ['thanks', 'imperium', 'decree', 'exiles']) {
    if (m === 'exiles' && F.treasury < 400) continue;
    if (m === 'decree' && F.treasury < decreeCost(F) + 200) continue;
    if (!motionBlocked(s, F, m)) { motion(s, F, m); return; }
  }
  // with the Senate in hand, outlaw the most dangerous rival it dislikes (not every month)
  if ((s.emperor === F.id || s.prov.ROM.owner === F.id) && s.R.ai.chance(0.25)) {
    const X = Object.values(s.factions).filter((x) => x.alive && x.id !== F.id && favour(s, x.id) < 35 && !motionBlocked(s, F, 'hostis', x.id)).sort((a, b) => strengthOf(s, b.id) - strengthOf(s, a.id))[0];
    if (X) motion(s, F, 'hostis', X.id);
  }
}

// Senate view for the screens
export function senateView(s, F) {
  const rivals = Object.values(s.factions).filter((x) => x.alive && x.kind !== 'state' && x.kind !== 'barbarian' && x.id !== F.id);
  const motions = ['decree', 'imperium', 'thanks', 'aerarium', 'exiles'].map((m) => ({ id: m, why: motionBlocked(s, F, m) }));
  return {
    favour: Math.round(favour(s, F.id)), hostis: isHostis(s, F.id), hostisUntil: initSenate(s).hostis[F.id] ?? null,
    imperium: !!F.imperium, decree: !!F.decree, decreeCost: decreeCost(F), courted: F.courtTurn === s.turn, motionUsed: F.motionTurn === s.turn,
    recognition: recognitionLegit(s, F), motions,
    rivals: rivals.map((x) => ({ id: x.id, name: x.name, favour: Math.round(favour(s, x.id)), hostis: isHostis(s, x.id), why: motionBlocked(s, F, 'hostis', x.id) })).sort((a, b) => b.favour - a.favour),
    italy: ITALY.includes(F.base),
  };
}
