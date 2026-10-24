// view(state): everything the screens show, computed here and only here.
// The UI renders this object and calls act(); it does no arithmetic of its own.
import { PROVINCES } from '../data/world.js';
import { CLIENTS } from '../data/people.js';
import { CONFIG } from './config.js';
import { PROV, ITALY, distance } from './graph.js';
import { legionName, bodiesAt, debtTotal, ownedLegions, ownedProvinces, strengthOf, armyPower } from './core.js';
import { optionInfo } from './combat.js';
import { act1Targets, bodyKey, lettersAllowed, TAX_LEVELS } from './actions.js';
import { standing, treatyBetween, evaluate, seat, clientStatus, canSubvert, subvertCost, decreeCost } from './diplomacy.js';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthName(turn) { const m = (2 + turn) % 12, y = 68 + Math.floor((2 + turn) / 12); return `${MONTHS[m]} AD ${y}`; }

export const FACTION_COLOR = {
  player: '#C8102E', state: '#B9BDC3', galba: '#B0803A', otho: '#5E7088', vitellius: '#7A7A45', vespasian: '#8C6239',
};
const OTHER = ['#9A8C7A', '#8A7F8E', '#7F8C7A', '#A08770', '#7B8590', '#94877A'];
export function factionColor(s, id) {
  if (FACTION_COLOR[id]) return FACTION_COLOR[id];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return OTHER[h % OTHER.length];
}

const band = (p) => (p >= 0.65 ? 'Likely' : p >= 0.4 ? 'Even' : p >= 0.2 ? 'Doubtful' : 'Long odds');
const ratioBand = (r) => (r >= 2 ? 'You far outnumber them' : r >= 1.3 ? 'You are stronger' : r >= 0.9 ? 'An even fight' : r >= 0.6 ? 'They are stronger' : 'They far outnumber you');
const k = (x) => Math.round(x);

function legionView(s, l) {
  return {
    id: l.id, name: legionName(l), men: l.men, loyalty: Math.round(l.loyalty), exp: l.exp,
    loc: l.loc, station: l.station, army: l.army, garrison: !!l.garrison, debt: k(l.debt), debtDue: l.debtDue, overdue: !!l.overdue,
    bought: !!l.bought, levy: !!l.levy, client: l.client || null, pay: k(l.men * CONFIG.payPerMan * l.payMult),
  };
}

function bodyView(s, F, A, b, ctx) {
  const info = optionInfo(s, F, A, b, ctx);
  const who = b.kind === 'legion' ? legionName(b.legion) : b.kind === 'army' ? `${s.factions[b.army.owner].name}'s army (${b.army.legions.length} legions)` : b.kind === 'aux' ? `The garrison of ${PROV[b.prov.id].name}` : b.kind === 'town' ? `A walled town of ${PROV[b.prov.id].name}` : 'Raiders';
  const men = b.kind === 'army' ? b.army.legions.reduce((a, id) => a + s.legions[id].men, 0) : b.kind === 'legion' ? b.legion.men : b.kind === 'aux' ? b.prov.aux : b.town ? b.town.men : 0;
  const owner = b.kind === 'army' ? b.army.owner : b.kind === 'legion' ? b.legion.owner : b.prov.owner;
  const comrades = F.comrades && (b.legion ? b.legion.group : null) === F.comrades;
  return {
    key: bodyKey(b), kind: b.kind, who, men, owner, ownerName: s.factions[owner]?.name,
    loyalty: b.kind === 'legion' ? Math.round(b.legion.loyalty) : null, comrades,
    options: [
      { id: 'buy', label: 'Buy them', cost: `${k(info.buy.cost)}k now`, ok: info.buy.ok, why: info.buy.why },
      { id: 'promise', label: 'Promise money', cost: `${k(info.buy.promise)}k owed in ${CONFIG.promiseMonths} months`, ok: info.buy.promiseOk, why: info.buy.promiseOk ? '' : info.buy.why },
      { id: 'negotiate', label: info.negotiate.kind === 'appeal' ? 'Appeal to them' : 'Offer terms in the Senate\'s name', cost: `${band(info.negotiate.chance)}${comrades ? ' · your old comrades' : ''}`, ok: info.negotiate.ok, why: info.negotiate.why },
      { id: 'fight', label: b.kind === 'town' ? 'Storm the walls' : 'Fight', cost: ratioBand(info.ratio), ok: true, why: '' },
      ...(A ? [{ id: 'bypass', label: 'March past', cost: 'Leaves them behind you', ok: info.bypass.ok, why: info.bypass.why }] : []),
    ],
  };
}

function visibleDispatches(s) {
  const P = s.factions.player;
  const here = P.alive ? seat(s, P) : P.base;
  const out = [];
  for (const d of s.dispatches) {
    const lag = d.loc ? Math.ceil(distance(d.loc, here) / 2) : 0;
    if (d.t + lag <= s.turn) out.push({ ...d, when: monthName(d.t), late: lag > 0 });
  }
  return out.slice(-60).reverse();
}

export function view(s) {
  const P = s.factions.player;
  const myLegs = ownedLegions(s, 'player');
  const myProvs = ownedProvinces(s, 'player');
  const A = P.leaderArmy && s.armies[P.leaderArmy];
  const income = myProvs.reduce((a, q) => a + (q.breachUntil > s.turn ? 0 : PROV[q.id].rev * ({ light: 0.85, heavy: 1.4, extort: 1.8 }[q.tax] || 1) * (q.unrest > 60 ? 0.5 : 1)), 0) + (s.emperor === 'player' ? ownedProvinces(s, 'state').reduce((a, q) => a + PROV[q.id].rev * CONFIG.stateShare, 0) : 0);
  const pay = P.ownsProvince ? myLegs.reduce((a, l) => a + l.men * CONFIG.payPerMan * l.payMult, 0) : 0;

  const provinces = PROVINCES.map((d) => {
    const q = s.prov[d.id];
    const legs = Object.values(s.legions).filter((l) => l.loc === d.id);
    const mine = q.owner === 'player';
    return {
      id: d.id, name: d.name, tier: d.tier, owner: q.owner, ownerName: s.factions[q.owner]?.name, color: factionColor(s, q.owner),
      rev: d.rev, grain: d.grain, unrest: Math.round(q.unrest), tax: q.tax || 'normal', grainPolicy: q.grainPolicy || 'embargo', aux: q.aux,
      towns: q.towns.filter((t) => t.men > 0).length, frontier: d.frontier || null, threat: d.frontier ? Math.round(s.threat[d.frontier]) : null,
      breach: q.breachUntil > s.turn, mine,
      legions: legs.map((l) => ({ id: l.id, name: legionName(l), owner: l.owner, men: l.men })),
      taxes: mine ? TAX_LEVELS.map((t) => ({ level: t, rev: k(d.rev * ({ light: 0.85, normal: 1, heavy: 1.4, extort: 1.8 }[t])), unrest: { light: -5, normal: -3, heavy: 3, extort: 9 }[t] })) : null,
      canLevy: mine && !P.levy && d.tier !== 'proc' && q.unrest < 70 && P.treasury >= CONFIG.levyCost,
      canLetter: P.rebel && q.owner === 'state' && !legs.length && myProvs.some((m) => distance(m.id, d.id) <= 1),
    };
  });

  const rivals = Object.values(s.factions).filter((f) => f.kind !== 'barbarian' && f.id !== 'player' && f.kind !== 'state' && (f.alive || f.submittedTo));
  const factions = rivals.map((f) => {
    const t = treatyBetween(s, 'player', f.id);
    return {
      id: f.id, name: f.name, kind: f.kind, alive: f.alive, submittedTo: f.submittedTo || null, color: factionColor(s, f.id),
      legions: ownedLegions(s, f.id).length, provinces: ownedProvinces(s, f.id).length, strength: k(strengthOf(s, f.id) / 1000), legit: Math.round(f.legit),
      acclaimed: f.acclaimed, standing: Math.round(standing(s, 'player', f.id)), road: f.road,
      seat: f.alive ? seat(s, f) : null, distance: f.alive && P.alive ? distance(seat(s, P), seat(s, f)) : null,
      treaty: t ? { id: t.id, type: t.type, until: t.until, hostages: t.hostages } : null,
      truce: f.alive ? evaluate(s, f, P, 'truce') : null,
      submission: f.alive ? evaluate(s, f, P, 'submission') : null,
    };
  });

  const pending = s.pending.map((pd) => {
    const army = s.armies[pd.army];
    if (!army) return null;
    const bodies = bodiesAt(s, 'player', pd.prov).sort((a, b) => (a.kind === 'army' ? 0 : a.kind === 'legion' ? 1 : 2) - (b.kind === 'army' ? 0 : b.kind === 'legion' ? 1 : 2));
    return { id: pd.id, prov: pd.prov, provName: PROV[pd.prov].name, army: pd.army, power: k(armyPower(s, army) / 1000), bodies: bodies.map((b) => bodyView(s, P, army, b, { destination: pd.destination })) };
  }).filter(Boolean);

  let act1 = null;
  if (P.alive && !P.ownsProvince) {
    const t = act1Targets(s);
    act1 = {
      province: P.base, provName: PROV[P.base].name, neroLives: s.turn < 3, suspicion: Math.round(P.suspicion), approached: P.approached === s.turn,
      share: Math.round((100 * t.menMine) / Math.max(1, t.menAll)), governorOpen: t.governorOpen,
      bodies: t.bodies.map((b) => bodyView(s, P, null, b, { act1: true, power: t.power })),
    };
  }

  const rome = s.actIVOpen || s.emperor === 'player' ? {
    emperor: s.emperor ? s.factions[s.emperor].name : 'none', youRule: s.emperor === 'player', holder: s.factions[s.prov.ROM.owner]?.name,
    unrest: Math.round(s.romeUnrest), hold: P.hold || 0, holdTarget: s.diff.hold,
    whispers: P.whispers ? Math.round(P.whispers * 100) : 0,
    praetorians: s.legions.PRAET ? { owner: s.factions[s.legions.PRAET.owner].name, loyalty: Math.round(s.legions.PRAET.loyalty), debt: k(s.legions.PRAET.debt) } : null,
    grain: Object.values(s.prov).filter((q) => PROV[q.id].grain && (q.owner === s.emperor || q.owner === 'state')).reduce((a, q) => a + PROV[q.id].grain, 0), grainNeed: CONFIG.romeGrainNeed,
  } : null;

  const legatesFar = Object.values(s.legions).filter((l) => !canSubvert(s, P, l) || canSubvert(s, P, l) === 'Not enough money').filter((l) => s.factions[l.owner].kind !== 'state' && l.owner !== 'player')
    .map((l) => ({ id: l.id, name: legionName(l), owner: s.factions[l.owner].name, loc: l.loc, loyalty: Math.round(l.loyalty), cost: k(subvertCost(s, P, l)), ok: !canSubvert(s, P, l) }));

  return {
    turn: s.turn, month: monthName(s.turn), act: s.actIVOpen ? 4 : !P.ownsProvince ? 1 : !P.acclaimed ? 2 : 3,
    difficulty: s.opts.difficulty, outcome: s.outcome,
    player: {
      name: P.name, alive: P.alive, road: P.road, stats: P.stats, legit: Math.round(P.legit), treasury: k(P.treasury), borrowed: k(P.borrowed),
      owed: k(debtTotal(s, 'player')), income: k(income), pay: k(pay), acclaimed: P.acclaimed, decree: !!P.decree, decreeCost: decreeCost(P),
      ownsProvince: P.ownsProvince, base: P.base, comrades: P.comrades, friends: P.friends || [],
      letters: lettersAllowed(P) - (P.letterTurn === s.turn ? P.lettersUsed : 0), envoys: (P.road === 'politics' ? 2 : 1) - (P.envoyTurn === s.turn ? P.envoys : 0),
      levy: P.levy ? { at: P.levy.at, done: monthName(P.levy.done) } : null, emperor: s.emperor === 'player',
      canAcclaim: P.ownsProvince && !P.acclaimed,
    },
    army: A ? { id: A.id, loc: A.loc, dest: A.dest, path: A.path, power: k(armyPower(s, A) / 1000), legions: A.legions.map((id) => legionView(s, s.legions[id])), halted: s.pending.some((p) => p.army === A.id) } : null,
    legions: myLegs.map((l) => legionView(s, l)),
    provinces, factions, pending, act1, rome,
    armies: Object.values(s.armies).filter((x) => x.legions.length && s.factions[x.owner]?.alive && s.factions[x.owner].kind !== 'state').map((x) => ({ id: x.id, owner: x.owner, ownerName: s.factions[x.owner].name, color: factionColor(s, x.owner), loc: x.loc, dest: x.dest, path: x.path, legions: x.legions.length, mine: x.owner === 'player' })),
    offers: s.offers.filter((o) => s.factions[o.from]?.alive).map((o) => ({ ...o, fromName: s.factions[o.from]?.name, targetName: o.target ? s.factions[o.target]?.name : null })),
    clients: CLIENTS.map((c) => ({ id: c.id, name: cap(c.name), near: c.near, men: c.men, cost: c.cost, why: clientStatus(s, P, c), standing: Math.round(standing(s, 'player', 'client:' + c.id)), parthian: !!c.legit })),
    subvertable: legatesFar.slice(0, 12),
    dispatches: visibleDispatches(s),
    ledger: s.ledger.filter((r) => r[0] === s.turn - 1).reduce((acc, [, x, why]) => { const key = why.split(':')[0]; acc[key] = (acc[key] || 0) + x; return acc; }, {}),
    italy: ITALY,
  };
}
