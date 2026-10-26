import { guideView } from './tutorial.js';
import { senateView, favour, isHostis } from './senate.js';
import { peoplesView } from './foreign.js';
import { goodsView, tradeIncome, partnersOf, agreementGains, tradeBetween } from './trade.js';
import { GOODS, PERSONALITY, PRODUCES } from '../data/powers.js';
// view(state): everything the screens show, computed here and only here.
// The UI renders this object and calls act(); it does no arithmetic of its own.
import { PROVINCES } from '../data/world.js';
import { CLIENTS } from '../data/people.js';
import { CONFIG } from './config.js';
import { PROV, ITALY, distance } from './graph.js';
import { legionName, bodiesAt, debtTotal, ownedLegions, ownedProvinces, strengthOf, armyPower, chestOf, actOf, nearestHeld } from './core.js';
import { balanceOf, incomeOf, payOf, upkeepOf, legionPay, atHome, provinceRevenue } from './world.js';
import { commanderOf, STYLE_TEXT, armyOfGeneral, MAX_GENERALS } from './generals.js';
import { eventView } from './story.js';
import { optionInfo, generalOf } from './combat.js';
import { BUILDINGS, SLOTS, TRAITS, GAMES_COST } from '../data/buildings.js';
import { canBuild, candidates, revenueMult, revenueFlat, unrestDelta, levyCostMult, levyMonthsOff, levyCostFor, buildCost, gamesCost } from './buildings.js';
import { CAPITALS } from '../data/seeds.js';
import { ORDERS, orderBlocked, sectorState, frontOf, ROUNDS_DAY, ROUNDS_MAX } from './battle.js';
import { act1Targets, bodyKey, lettersAllowed, romeCosts, TAX_LEVELS } from './actions.js';
import { standing, treatyBetween, evaluate, seat, clientStatus, canSubvert, subvertCost } from './diplomacy.js';
import { decreeCost } from './senate.js';

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
    bought: !!l.bought, levy: !!l.levy, client: l.client || null, pay: k(legionPay(s, l)), home: atHome(s, l),
    due: l.debt > 0 ? monthName(Math.max(l.debtDue, s.turn)) : null, dueIn: l.debt > 0 ? Math.max(0, l.debtDue - s.turn) : null, canPart: l.debt > 0 && !l.extended,
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
      { id: 'promise', label: 'Promise money', cost: `${k(info.buy.promise)}k due ${monthName(s.turn + CONFIG.promiseMonths)}`, ok: info.buy.promiseOk, why: info.buy.promiseOk ? '' : info.buy.why,
        note: `You make ${balanceOf(s, F) >= 0 ? '+' : ''}${k(balanceOf(s, F))}k a month now, and already owe ${k(debtTotal(s, F.id))}k.` },
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

const GENERAL_TEXT = {
  impetuous: 'Impetuous: charges early and often, relieves his lines late.',
  methodical: 'Methodical: throws his pila well, relieves on time, charges a tired line.',
  cunning: 'Cunning: feints, ruses, and horse on the flanks.',
  cautious: 'Cautious: holds, falls back, waits for you to come to him.',
  legates: 'Your legates: steady and unimaginative.',
};
const ORDER_TEXT = {
  hold: ['Hold', 'Brace and dress ranks'], advance: ['Advance', 'Close in; in contact, push'], pila: ['Pila', 'Throw a volley'],
  charge: ['Charge', 'Shock attack; very tiring'], relieve: ['Relieve', 'Fresh line to the front'], fallback: ['Fall back', 'Give ground'],
};
const band3 = (x, a, b) => (x >= b ? 'fresh' : x >= a ? 'tiring' : 'spent');

const sideMen = (side) => Object.values(side.cohorts).filter((c) => c.state !== 'routed' && c.state !== 'gone').reduce((a, c) => a + Math.max(0, c.men), 0) + side.cav.reduce((a, c) => a + c.men, 0);

// The field, seen from the player's side: you are always at the bottom, and
// sector 0 is your left.
function battleView(s) {
  const b = s.battle;
  const youKey = b.player, foeKey = youKey === 'att' ? 'def' : 'att';
  const you = b.sides[youKey], foe = b.sides[foeKey];
  const toScreen = (k) => (youKey === 'att' ? k : 2 - k); // engine sector -> your column
  const fromScreen = (col) => (youKey === 'att' ? col : 2 - col);
  const cohorts = [];
  for (const [key, side, mine] of [[youKey, you, true], [foeKey, foe, false]]) {
    for (let k = 0; k < 3; k++) {
      const S = side.sectors[k];
      S.lines.forEach((line, i) => {
        const depth = i - S.front;
        if (depth < 0) return;
        line.forEach((id, j) => { const c = side.cohorts[id]; if (c.men <= 0 || c.state === 'gone') return; cohorts.push({ id, mine, col: toScreen(k), depth, slot: j, slots: line.length, legion: c.legion, name: legionName({ id: c.legion }), n: c.n, men: c.men, max: c.max, morale: Math.round(c.morale), end: Math.round(c.end), pila: c.pila, state: c.state, routed: S.routed }); });
      });
      for (const id of S.broken) { const c = side.cohorts[id]; if (c.men > 0) cohorts.push({ id, mine, col: toScreen(k), depth: -1, slot: 0, slots: 1, legion: c.legion, name: legionName({ id: c.legion }), n: c.n, men: c.men, max: c.max, morale: Math.round(c.morale), end: Math.round(c.end), pila: c.pila, state: 'routed', routed: true }); }
    }
    side.reserve.forEach((id, j) => { const c = side.cohorts[id]; cohorts.push({ id, mine, col: 1, depth: 9, slot: j, slots: side.reserve.length, legion: c.legion, name: legionName({ id: c.legion }), n: c.n, men: c.men, max: c.max, morale: Math.round(c.morale), end: Math.round(c.end), pila: c.pila, state: 'reserve', routed: false }); });
  }
  const sectors = [0, 1, 2].map((col) => {
    const k = fromScreen(col);
    const S = you.sectors[k], T = foe.sectors[k];
    const m = sectorState(you, k), t = sectorState(foe, k);
    return {
      col, k, label: ['Left', 'Centre', 'Right'][col], dist: S.dist, order: S.order, routed: S.routed, reliefs: S.reliefs, linesLeft: m.linesLeft,
      mine: { men: Math.round(m.men), morale: Math.round(m.morale), end: Math.round(m.end), pila: Math.round(m.pila * 10) / 10 },
      theirs: { men: Math.round(t.men / 50) * 50, state: T.routed ? 'broken' : band3(t.end, 35, 70), shaken: t.morale < 35 ? 'wavering' : t.morale < 60 ? 'shaken' : 'steady', routed: T.routed, lastOrder: T.history.slice(-1)[0] || null },
      orders: ORDERS.map((o) => ({ id: o, label: ORDER_TEXT[o][0], does: ORDER_TEXT[o][1], why: orderBlocked(you, k, o) })),
    };
  });
  return {
    id: b.id, loc: b.loc, locName: CAPITALS[b.loc] || PROV[b.loc]?.name, round: b.round, rounds: ROUNDS_DAY, maxRounds: ROUNDS_MAX, night: b.round >= ROUNDS_DAY, dusk: b.dusk, over: b.over,
    result: b.over ? (b.winner === 'draw' ? 'draw' : b.winner === youKey ? 'won' : 'lost') : null, retreated: b.retreated === youKey, theyRetreated: !!b.retreated && b.retreated !== youKey, attacking: youKey === 'att',
    enemy: s.factions[foe.fid]?.name, enemyColor: factionColor(s, foe.fid), enemyGeneral: foe.general, enemyGeneralText: GENERAL_TEXT[foe.general],
    sectors, cohorts, log: b.log.map((l) => l.text), events: (b.lastEvents || []).map((e) => ({ ...e, col: e.sector !== undefined ? toScreen(e.sector) : null, mine: e.side === youKey })),
    reserve: { count: you.reserve.length, used: you.reserveUsed, order: you.reserveOrder == null ? null : toScreen(you.reserveOrder) },
    cavalry: you.cav.map((c) => ({ pos: c.pos, col: toScreen(c.pos) === 0 ? 'left' : 'right', men: c.men, end: Math.round(c.end), order: c.order, beaten: c.beaten > 0, canPursue: foe.sectors[c.pos].routed })),
    enemyCavalry: foe.cav.map((c) => ({ col: toScreen(c.pos) === 0 ? 'left' : 'right', men: Math.round(c.men / 50) * 50, beaten: c.beaten > 0 })),
    legate: { action: you.legate.action, target: you.legate.target == null ? 1 : toScreen(you.legate.target), ruseUsed: you.ruseUsed, rallyUsed: you.rallyUsed, gratia: s.factions.player.stats.gratia },
    fromScreen: [0, 1, 2].map(fromScreen),
    present: you.present !== false, yourGeneral: you.present !== false ? null : ((s.factions.player.generals || []).find((g) => g.id === you.generalId)?.name || 'A senior tribune'),
    yourGeneralText: GENERAL_TEXT[you.general] || STYLE_TEXT[you.general],
    men: { mine: Math.round(sideMen(you)), theirs: Math.round(sideMen(foe) / 100) * 100 },
    retreatCost: sectors.some((x) => x.dist === 0) ? Math.round(CONFIG.retreatLoss[0] * 100) : Math.round(CONFIG.retreatLoss[1] * 100),
  };
}

// What to do next, in one line, and which tab does it.
function objectiveOf(s, P, act, armies) {
  if (!P.alive) return null;
  if (s.event) return { tab: null, text: `Answer: ${s.event.title}.` };
  if (s.pending.length) return { tab: 'army', text: `An army of yours has met the enemy at ${PROV[s.pending[0].prov].name}. Decide what to do.` };
  if (act === 1) {
    const t = act1Targets(s);
    if (P.approached === s.turn) return { tab: null, text: 'You have made this month\'s approach. End the month.' };
    if (t.governorOpen) return { tab: 'army', text: `Only the governor stands between you and ${PROV[P.base].name}. Approach him (Army tab).` };
    return { tab: 'army', text: `Win the legions of ${PROV[P.base].name}: ${Math.round((100 * t.menMine) / Math.max(1, t.menAll))}% of the men are yours; at 75% the governor is next. One approach a month (Army tab).` };
  }
  if (act === 2) return { tab: 'map', text: `Grow: ${ownedLegions(s, 'player').length} legions, ${ownedProvinces(s, 'player').length} province${ownedProvinces(s, 'player').length === 1 ? '' : 's'}. Tap a neighbour on the map to march or write. When ready, be hailed imperator (Army tab).` };
  if (s.emperor === 'player') return { tab: 'rome', text: `Hold Rome: ${P.hold || 0} of ${s.diff.hold} months. Keep the crowd fed and plots watched (Rome tab).` };
  if (s.prov.ROM.owner === 'player') return { tab: 'rome', text: 'You hold Rome. Clear enemy legions from Etruria and Campania and the Senate must recognise you.' };
  const lead = armies.find((a) => a.leader);
  return { tab: 'map', text: `March on Rome when you are strong enough${lead ? ` (your army: ${lead.power}k)` : ''}. ${act === 4 ? 'Only the four claimants remain.' : 'Act IV opens in July 69.'}` };
}

export function view(s) {
  const P = s.factions.player;
  const myLegs = ownedLegions(s, 'player');
  const myProvs = ownedProvinces(s, 'player');
  const A = P.leaderArmy && s.armies[P.leaderArmy];
  const income = incomeOf(s, P), pay = payOf(s, P), upkeep = upkeepOf(s, P), balance = balanceOf(s, P);

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
      taxes: mine ? TAX_LEVELS.map((t) => ({ level: t, rev: k(provinceRevenue(s, q, t)), unrest: { light: -5, normal: -3, heavy: 3, extort: 9 }[t] + unrestDelta(q) })) : null,
      chest: q.owner === 'state' ? chestOf(s, q) : 0, goods: (PRODUCES[d.id] || []).map((g) => GOODS[g].name),
      worksUsed: (q.buildings || []).length + (q.building ? 1 : 0), canBuildAny: mine && Object.keys(BUILDINGS).some((id) => !canBuild(s, P, d.id, id)),
      canLevy: mine && !P.levy && d.tier !== 'proc' && q.unrest < 70 && P.treasury >= levyCostFor(s, 'player', q),
      canLetter: P.rebel && q.owner === 'state' && !legs.length && myProvs.some((m) => distance(m.id, d.id) <= 1),
      buildings: (q.buildings || []).map((id) => ({ id, name: BUILDINGS[id].name, latin: BUILDINGS[id].latin, does: BUILDINGS[id].does })),
      building: q.building ? { id: q.building.id, name: BUILDINGS[q.building.id].name, done: monthName(q.building.done) } : null,
      slots: SLOTS[d.tier],
      works: mine ? Object.entries(BUILDINGS).map(([id, B]) => ({ id, name: B.name, latin: B.latin, cost: buildCost(s, 'player', id), months: B.months, upkeep: B.upkeep, does: B.does, why: canBuild(s, P, d.id, id), built: (q.buildings || []).includes(id) })) : null,
      governor: q.governor ? { name: q.governor.name, trait: q.governor.trait, does: TRAITS[q.governor.trait].does, friend: q.governor.friend || null } : null,
      candidates: mine ? candidates(s, d.id).map((c, i) => ({ index: i, name: c.name, trait: c.trait, does: TRAITS[c.trait].does, friend: c.friend || null })) : null,
      revMult: Math.round((revenueMult(q) - 1) * 100), revFlat: revenueFlat(q), unrestMod: unrestDelta(q),
      gamesCost: gamesCost(s, 'player'), games: q.gamesTurn === s.turn,
      levyCost: k(levyCostFor(s, 'player', q)), levyMonths: CONFIG.levyMonths - (d.id === 'AFR' ? 1 : 0) - levyMonthsOff(q),
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
      tradeEval: f.alive ? evaluate(s, f, P, 'trade') : null, trading: !!tradeBetween(s, 'player', f.id),
      gains: f.alive ? (() => { const g = agreementGains(s, 'player', f.id); return { you: g.a.map((x) => GOODS[x].name), him: g.b.map((x) => GOODS[x].name) }; })() : null,
      cedable: f.alive && s.peace && s.peace[['player', f.id].sort().join('|')] ? ownedProvinces(s, f.id).filter((q) => q.id !== f.base && q.id !== 'ROM' && !Object.values(s.legions).some((l) => l.loc === q.id && l.owner === f.id) && myProvs.some((m) => distance(m.id, q.id) <= 1)).map((q) => ({ id: q.id, name: PROV[q.id].name, eval: evaluate(s, f, P, 'cede', q.id) })) : [],
      personality: PERSONALITY[f.id]?.text || null, favour: Math.round(favour(s, f.id)), hostis: isHostis(s, f.id),
      submission: f.alive ? evaluate(s, f, P, 'submission') : null,
    };
  });

  const pending = s.pending.map((pd) => {
    const army = s.armies[pd.army];
    if (!army) return null;
    const yours = { men: army.legions.reduce((a, id) => a + s.legions[id].men, 0), legions: army.legions.length, commander: commanderOf(s, P, army).name };
    if (pd.defence) {
      const E = s.armies[pd.attacker];
      if (!E || !E.legions.length) return null;
      const ratio = armyPower(s, army) / Math.max(1, armyPower(s, E));
      const men = E.legions.reduce((a, id) => a + s.legions[id].men, 0);
      return { id: pd.id, prov: pd.prov, provName: PROV[pd.prov].name, army: pd.army, defence: true, yours,
        enemy: { name: s.factions[E.owner].name, men, legions: E.legions.length, general: GENERAL_TEXT[generalOf(s.factions[E.owner])], odds: ratioBand(ratio), large: men + yours.men >= CONFIG.largeBattleMen },
        retreatTo: PROV[nearestHeld(s, 'player', army.from && army.from !== army.loc ? army.from : army.loc, army.loc) || army.loc]?.name, rearguard: Math.round(CONFIG.rearguardLoss * 100), bodies: [] };
    }
    const bodies = bodiesAt(s, 'player', pd.prov).sort((a, b) => (a.kind === 'army' ? 0 : a.kind === 'legion' ? 1 : 2) - (b.kind === 'army' ? 0 : b.kind === 'legion' ? 1 : 2));
    return { id: pd.id, prov: pd.prov, provName: PROV[pd.prov].name, army: pd.army, power: k(armyPower(s, army) / 1000), yours,
      retreatTo: PROV[nearestHeld(s, 'player', army.from && army.from !== army.loc ? army.from : army.loc, army.loc) || army.from || army.loc]?.name,
      bodies: bodies.map((b) => bodyView(s, P, army, b, { destination: pd.destination })) };
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
    whispers: P.whispers ? Math.round(P.whispers * 100) : 0, plotWarned: !!(P.plot && P.plot.warned), informersPaid: P.informers === s.turn + 1,
    costs: romeCosts(s, P),
    praetorians: s.legions.PRAET ? { owner: s.factions[s.legions.PRAET.owner].name, loyalty: Math.round(s.legions.PRAET.loyalty), debt: k(s.legions.PRAET.debt) } : null,
    grain: Object.values(s.prov).filter((q) => PROV[q.id].grain && (q.owner === s.emperor || q.owner === 'state')).reduce((a, q) => a + PROV[q.id].grain, 0), grainNeed: CONFIG.romeGrainNeed,
  } : null;

  const legatesFar = Object.values(s.legions).filter((l) => !canSubvert(s, P, l) || canSubvert(s, P, l) === 'Not enough money').filter((l) => s.factions[l.owner].kind !== 'state' && l.owner !== 'player')
    .map((l) => ({ id: l.id, name: legionName(l), owner: s.factions[l.owner].name, loc: l.loc, loyalty: Math.round(l.loyalty), cost: k(subvertCost(s, P, l)), ok: !canSubvert(s, P, l) }));

  const armies = Object.values(s.armies).filter((x) => x.owner === 'player' && x.legions.length).map((x) => {
    const c = commanderOf(s, P, x);
    return {
      id: x.id, loc: x.loc, locName: PROV[x.loc].name, dest: x.dest && x.dest !== x.loc ? x.dest : null, destName: x.dest && x.dest !== x.loc ? PROV[x.dest].name : null, stages: x.path.length,
      leader: x.id === P.leaderArmy, column: !!x.column, joining: x.column ? commanderOf(s, P, s.armies[x.column] || x).name : null,
      commander: c.name, style: c.style, styleText: c.style ? STYLE_TEXT[c.style] : null, generalId: c.id || null,
      men: x.legions.reduce((a, id) => a + s.legions[id].men, 0), power: k(armyPower(s, x) / 1000), over: x.legions.length > CONFIG.supplyLimit,
      halted: s.pending.some((p) => p.army === x.id), waiting: (x.wait || 0) > 0,
      legions: x.legions.map((id) => legionView(s, s.legions[id])),
    };
  }).sort((a, b) => (b.leader - a.leader) || (a.column - b.column) || b.men - a.men);
  const garrisonsByProv = {};
  for (const l of myLegs.filter((x) => !x.army)) (garrisonsByProv[l.loc] = garrisonsByProv[l.loc] || []).push(legionView(s, l));
  const garrisons = Object.entries(garrisonsByProv).map(([pid, legs]) => ({ pid, name: PROV[pid].name, legions: legs, armiesHere: armies.filter((a) => a.loc === pid && !a.column).map((a) => a.id) }));
  const generals = (P.generals || []).map((g) => { const A = armyOfGeneral(s, g.id); return { ...g, styleText: STYLE_TEXT[g.style], army: A ? A.id : null, armyAt: A ? PROV[A.loc].name : null }; });

  const warnings = [];
  for (const l of myLegs) {
    if (l.debt > 0 && l.overdue) warnings.push({ kind: 'money', text: `${legionName(l)} is owed ${k(l.debt)}k past its day: loyalty falls every month until paid.` });
    else if (l.debt > 0 && l.debtDue <= s.turn + 1 && P.treasury < l.debt) warnings.push({ kind: 'money', text: `${k(l.debt)}k is due to ${legionName(l)} ${l.debtDue <= s.turn ? 'now' : 'next month'}, and you have ${k(P.treasury)}k. Pay half to buy time.` });
    if (l.loyalty < 30) warnings.push({ kind: 'men', text: `${legionName(l)} is close to mutiny (loyalty ${Math.round(l.loyalty)}).` });
  }
  if (P.ownsProvince && balance < 0 && P.treasury + balance * 3 < 0) warnings.push({ kind: 'money', text: `You lose ${k(-balance)}k a month: the treasury runs dry in ${Math.max(0, Math.floor(P.treasury / -balance))} month${Math.floor(P.treasury / -balance) === 1 ? '' : 's'}. Take richer provinces, raise taxes, or send legions home to their own provinces.` });
  for (const q of myProvs) {
    if (q.unrest > 60) warnings.push({ kind: 'land', text: `${PROV[q.id].name}: unrest ${Math.round(q.unrest)}. Revenue is halved above 60; above 85 it revolts.` });
    const f = PROV[q.id].frontier;
    if (f && s.threat[f] >= 70) warnings.push({ kind: 'land', text: `${PROV[q.id].name}: the frontier is under threat (${Math.round(s.threat[f])}). At 100 it breaks; legions there hold it.` });
  }
  for (const a of armies) if (a.over) warnings.push({ kind: 'men', text: `${a.leader ? 'Your army' : 'The army of ' + a.commander} has more than ${CONFIG.supplyLimit} legions: they go hungry and lose men.` });
  if (!P.ownsProvince && P.suspicion >= 70) warnings.push({ kind: 'men', text: `Suspicion ${Math.round(P.suspicion)}: at 100 Rome recalls you.` });

  const act = actOf(s);
  const objective = objectiveOf(s, P, act, armies);
  const news = s.report ? (() => {
    const here = P.alive ? seat(s, P) : P.base;
    return s.dispatches.map((d, i) => ({ d, i, arrive: d.t + (d.loc ? Math.ceil(distance(d.loc, here) / 2) : 0) }))
      .filter(({ i, arrive }) => arrive <= s.turn && (i >= s.report.dispatchesAt || arrive === s.turn)).map(({ d }) => d.text).slice(-6);
  })() : null;

  return {
    turn: s.turn, month: monthName(s.turn), act,
    story: s.story && s.story.length ? { ...s.story[0], left: s.story.length - 1 } : null,
    guide: guideView(s),
    event: eventView(s), storyLog: (s.storyLog || []).slice().reverse(),
    report: s.report ? { ...s.report, month: monthName(s.report.turn), news, warnings } : null,
    senate: senateView(s, P), peoples: peoplesView(s, P), goods: goodsView(s, 'player'), tradeParts: (() => { const t = tradeIncome(s, 'player'); return { market: k(t.market), agreements: k(t.agreements), silk: k(t.silk), total: k(t.total) }; })(),
    partners: partnersOf(s, 'player').map((x) => s.factions[x]?.name),
    warnings, objective, myArmies: armies, garrisons, generals, maxGenerals: MAX_GENERALS,
    difficulty: s.opts.difficulty, outcome: s.outcome,
    player: {
      name: P.name, alive: P.alive, road: P.road, stats: P.stats, legit: Math.round(P.legit), treasury: k(P.treasury), borrowed: k(P.borrowed),
      owed: k(debtTotal(s, 'player')), income: k(income), trade: k(tradeIncome(s, 'player').total), pay: k(pay), upkeep: k(upkeep), interest: k(P.borrowed * CONFIG.interest), balance: k(balance), acclaimed: P.acclaimed, decree: !!P.decree, decreeCost: decreeCost(P),
      ownsProvince: P.ownsProvince, base: P.base, comrades: P.comrades, friends: P.friends || [],
      letters: lettersAllowed(P) - (P.letterTurn === s.turn ? P.lettersUsed : 0), envoys: (P.road === 'politics' ? 2 : 1) - (P.envoyTurn === s.turn ? P.envoys : 0),
      levy: P.levy ? { at: P.levy.at, done: monthName(P.levy.done) } : null, emperor: s.emperor === 'player',
      canAcclaim: P.ownsProvince && !P.acclaimed,
    },
    army: A ? { id: A.id, loc: A.loc, dest: A.dest, path: A.path, power: k(armyPower(s, A) / 1000), legions: A.legions.map((id) => legionView(s, s.legions[id])), halted: s.pending.some((p) => p.army === A.id) } : null,
    legions: myLegs.map((l) => legionView(s, l)),
    provinces, factions, pending, act1, rome, battle: s.battle ? battleView(s) : null, lastBattle: s.lastBattle || null,
    armies: Object.values(s.armies).filter((x) => x.legions.length && s.factions[x.owner]?.alive && s.factions[x.owner].kind !== 'state').map((x) => ({ id: x.id, owner: x.owner, ownerName: s.factions[x.owner].name, color: factionColor(s, x.owner), loc: x.loc, dest: x.dest, path: x.path, legions: x.legions.length, mine: x.owner === 'player' })),
    offers: s.offers.filter((o) => s.factions[o.from]?.alive).map((o) => ({ ...o, fromName: s.factions[o.from]?.name, targetName: o.target ? s.factions[o.target]?.name : null })),
    clients: CLIENTS.map((c) => ({ id: c.id, name: cap(c.name), near: c.near, men: c.men, cost: c.cost, why: clientStatus(s, P, c), standing: Math.round(standing(s, 'player', 'client:' + c.id)), parthian: !!c.legit })),
    subvertable: legatesFar.slice(0, 12),
    dispatches: visibleDispatches(s),
    ledger: s.ledger.filter((r) => r[0] === s.turn - 1).reduce((acc, [, x, why]) => { const key = why.split(':')[0]; acc[key] = (acc[key] || 0) + x; return acc; }, {}),
    italy: ITALY,
  };
}
