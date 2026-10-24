// Everything a human player can do. The UI calls act(state, action) and reads
// view(state); it computes nothing itself. Each action checks what the screen
// should already have checked, and returns { ok } or { error } in words.
import { CONFIG } from './config.js';
import { PROV, route, distance } from './graph.js';
import { money, bodiesAt, flipProvince, legionPower, ownedLegions, ownedProvinces, setDest, hostile, log } from './core.js';
import { chooseOption, concludeBattle, generalOf } from './combat.js';
import { ORDERS, orderBlocked, resolveRound, aiOrders, autoBattle, decideDusk } from './battle.js';
import { streamFor } from './rng.js';
import { leaderArmyOf, acclaim } from './ai.js';
import { propose, answerOffer, breakTreaty, giveGift, subvert, askClient, senateDecree } from './diplomacy.js';
import { step } from './turn.js';

export const TAX_LEVELS = ['light', 'normal', 'heavy', 'extort'];

export function lettersAllowed(F) { return F.stats.auct >= 4 ? 2 : 1; }

// A body in a province, found again from its key
export function bodyKey(b) {
  if (b.kind === 'army') return 'army:' + b.army.id;
  if (b.kind === 'legion') return 'legion:' + b.legion.id;
  if (b.kind === 'aux') return 'aux:' + b.prov.id;
  return 'town:' + b.prov.id + ':' + b.prov.towns.indexOf(b.town);
}
function findBody(s, fid, pid, key) { return bodiesAt(s, fid, pid).find((b) => bodyKey(b) === key); }

// The Act I targets: the other legions in your province, then the governor.
export function act1Targets(s) {
  const F = s.factions.player, here = F.base;
  const mine = ownedLegions(s, 'player').filter((l) => l.loc === here);
  const others = Object.values(s.legions).filter((l) => l.loc === here && l.owner !== 'player' && !l.army);
  const menMine = mine.reduce((a, l) => a + l.men, 0), menAll = menMine + others.reduce((a, l) => a + l.men, 0);
  const out = others.filter((l) => !(l.standAside.player > s.turn)).map((l) => ({ kind: 'legion', legion: l }));
  const governorOpen = menMine / Math.max(1, menAll) >= 0.74 || !others.length;
  if (governorOpen && s.prov[here].owner === 'state') out.push({ kind: 'aux', prov: s.prov[here] });
  return { bodies: out, mine, menMine, menAll, governorOpen, power: mine.reduce((a, l) => a + legionPower(s, l), 0) };
}

export function act(s, a) {
  const F = s.factions.player;
  if (s.outcome) return { error: 'The campaign is over' };
  if (!F.alive) return { error: 'You are dead' };
  const P = a.pid && s.prov[a.pid];
  const mineP = P && P.owner === 'player';
  switch (a.type) {
    case 'tax':
      if (!mineP) return { error: 'Not your province' };
      if (!TAX_LEVELS.includes(a.level)) return { error: 'Unknown tax level' };
      P.tax = a.level; return { ok: true };
    case 'taxAll':
      for (const Q of ownedProvinces(s, 'player')) Q.tax = a.level;
      return { ok: true };
    case 'grain':
      if (!mineP) return { error: 'Not your province' };
      if (!PROV[a.pid].grain) return { error: 'This province ships no grain' };
      P.grainPolicy = a.policy; return { ok: true };
    case 'levy': {
      if (!mineP) return { error: 'Not your province' };
      if (F.levy) return { error: 'A legion is already being raised' };
      if (PROV[a.pid].tier === 'proc') return { error: 'Too few citizens here to raise a legion' };
      if (P.unrest >= 70) return { error: 'The province is too unruly to recruit' };
      if (F.treasury < CONFIG.levyCost) return { error: 'Not enough money' };
      money(s, F, -CONFIG.levyCost, 'levy');
      F.levy = { at: a.pid, done: s.turn + CONFIG.levyMonths - (a.pid === 'AFR' ? 1 : 0) };
      return { ok: true };
    }
    case 'garrison': {
      const l = s.legions[a.legionId];
      if (!l || l.owner !== 'player') return { error: 'Not your legion' };
      l.garrison = !!a.on;
      if (l.garrison && l.army) { const A = s.armies[l.army]; A.legions = A.legions.filter((x) => x !== l.id); l.army = null; }
      return { ok: true };
    }
    case 'march': {
      if (!F.ownsProvince) return { error: 'You hold no province yet: win your legions first' };
      const A = leaderArmyOf(s, F);
      if (!A) return { error: 'You have no army' };
      if (!PROV[a.dest]) return { error: 'Unknown place' };
      if (s.pending.some((p) => p.army === A.id)) return { error: 'Your army is facing an enemy: decide that first' };
      if (a.dest !== A.loc && !route(A.loc, a.dest, false).length) return { error: 'No road there' };
      setDest(s, A, a.dest);
      return { ok: true };
    }
    case 'halt': {
      const A = leaderArmyOf(s, F);
      if (A) { A.dest = null; A.path = []; }
      return { ok: true };
    }
    case 'approach': {
      if (F.ownsProvince) return { error: 'Your province is already yours' };
      if (F.approached === s.turn) return { error: 'One approach a month: men talk' };
      const t = act1Targets(s);
      const b = t.bodies.find((x) => bodyKey(x) === a.key);
      if (!b) return { error: 'They are not there to approach' };
      const res = chooseOption(s, F, null, b, a.option, { act1: true, power: t.power, men: t.menMine, legions: t.mine });
      if (res && res.error) return res;
      F.approached = s.turn;
      if (b.kind === 'aux' && (res === 'cleared' || res === 'aside')) { flipProvince(s, s.prov[F.base], 'player', true); log(s, `The governor yields. ${PROV[F.base].name} is yours.`, F.base); }
      return { ok: true, result: res };
    }
    case 'acclaim':
      if (F.acclaimed) return { error: 'You are already proclaimed' };
      if (!F.ownsProvince) return { error: 'Hold a province first' };
      acclaim(s, F); log(s, 'Your legions hail you as imperator.'); return { ok: true };
    case 'letter': {
      if (!F.rebel) return { error: 'Letters to governors would reveal you: take your province first' };
      if ((F.letterTurn === s.turn ? F.lettersUsed : 0) >= lettersAllowed(F)) return { error: 'No more envoys this month' };
      if (!P || P.owner !== 'state') return { error: 'Only governors still loyal to the Senate can be written to' };
      if (Object.values(s.legions).some((l) => l.loc === a.pid)) return { error: 'Legions stand there: a letter will not move them' };
      if (!ownedProvinces(s, 'player').some((q) => distance(q.id, a.pid) <= 1)) return { error: 'Too far: write to your neighbours' };
      if (F.treasury < CONFIG.letterCost) return { error: 'Not enough money' };
      F.lettersUsed = (F.letterTurn === s.turn ? F.lettersUsed : 0) + 1; F.letterTurn = s.turn;
      money(s, F, -CONFIG.letterCost, 'letter');
      s.stats.letters++;
      const p = 0.04 + 0.04 * F.stats.auct + (F.legit - 30) / 400 + (s.emperor === F.id ? 0.1 : 0);
      const ok = s.R.ai.chance(Math.max(0.01, p));
      if (ok) { flipProvince(s, P, 'player', true); s.stats.gainedBy.letter++; log(s, `The governor of ${PROV[a.pid].name} declares for you.`, a.pid); }
      else log(s, `The governor of ${PROV[a.pid].name} sends your envoy back.`, a.pid);
      return { ok: true, result: ok ? 'won' : 'refused' };
    }
    case 'pay': {
      const legs = a.legionId ? [s.legions[a.legionId]] : ownedLegions(s, 'player').filter((l) => l.debt > 0 && (l.overdue || l.debtDue <= s.turn + 1));
      let paid = 0;
      for (const l of legs) {
        if (!l || l.owner !== 'player' || !(l.debt > 0)) continue;
        if (F.treasury < l.debt) break;
        money(s, F, -l.debt, 'promise paid: ' + l.id); paid += l.debt; l.debt = 0; l.debtDue = -1; l.overdue = false; l.loyalty = Math.min(100, l.loyalty + 4);
      }
      return paid ? { ok: true, paid } : { error: 'Nothing paid: not enough money, or nothing owed' };
    }
    case 'encounter': {
      const pend = s.pending.find((p) => p.id === a.pendingId);
      if (!pend) return { error: 'No such encounter' };
      const A = s.armies[pend.army];
      if (!A) { s.pending = s.pending.filter((p) => p !== pend); return { error: 'That army is gone' }; }
      if (a.option === 'withdraw') { withdraw(s, pend, A); return { ok: true, result: 'withdrew' }; }
      const b = findBody(s, 'player', pend.prov, a.key);
      if (!b) return { error: 'They are no longer there' };
      const res = chooseOption(s, F, A, b, a.option, { destination: pend.destination });
      if (res && res.error) return res;
      if (res === 'battle') return { ok: true, result: 'battle' };
      settle(s, pend);
      return { ok: true, result: res };
    }
    case 'propose': {
      const X = s.factions[a.to];
      if (!X || !X.alive) return { error: 'No one to treat with' };
      if (F.envoyTurn === s.turn && F.envoys >= (F.road === 'politics' ? 2 : 1)) return { error: 'Your envoys are all on the road' };
      F.envoys = (F.envoyTurn === s.turn ? F.envoys : 0) + 1; F.envoyTurn = s.turn;
      if (a.hostages && !F.acclaimed) return { error: 'Only a proclaimed claimant gives hostages' };
      return propose(s, F, X, a.kind, { target: a.target, months: a.months || 12, hostages: a.hostages });
    }
    case 'answer': return answerOffer(s, a.offerId, a.accept);
    case 'breakTreaty': return breakTreaty(s, F, a.treatyId);
    case 'gift': { const X = s.factions[a.to] || { id: a.to, name: a.to }; return giveGift(s, F, X, a.amount); }
    case 'subvert': { const l = s.legions[a.legionId]; if (!l) return { error: 'No such legion' }; return subvert(s, F, l); }
    case 'client': return askClient(s, F, a.client);
    case 'decree': return senateDecree(s, F);
    case 'rome': {
      if (s.emperor !== 'player') return { error: 'Only the emperor spends in Rome' };
      const costs = { dole: 150, senators: 200, consulships: 80, games: 100, informers: 120 };
      const c = costs[a.spend];
      if (!c) return { error: 'Unknown' };
      if (F.spentRome === s.turn + ':' + a.spend) return { error: 'Already done this month' };
      if (F.treasury < c) return { error: 'Not enough money' };
      money(s, F, -c, a.spend);
      F.spentRome = s.turn + ':' + a.spend;
      if (a.spend === 'dole') s.romeUnrest = Math.max(0, s.romeUnrest - 15);
      if (a.spend === 'senators') F.legit = Math.min(100, F.legit + 4);
      if (a.spend === 'consulships') F.legit = Math.min(100, F.legit + 2);
      if (a.spend === 'games') { F.legit = Math.min(100, F.legit + 2); s.romeUnrest = Math.max(0, s.romeUnrest - 10); }
      if (a.spend === 'informers') F.informers = s.turn; // halves this month's whispers
      return { ok: true };
    }
    case 'battleOrder': case 'battleReserve': case 'battleCav': case 'battleLegate': case 'battleRound': case 'battleAuto': case 'battleDusk':
      return battleAct(s, a);
    case 'endMonth': return endMonth(s);
    default: return { error: 'Unknown action ' + a.type };
  }
}

// After a choice: if nothing hostile is left, the province falls and the army
// may march on next month.
function settle(s, pend) {
  const A = s.armies[pend.army];
  if (!A || !A.legions.length) { s.pending = s.pending.filter((p) => p !== pend); return; }
  if (A.loc !== pend.prov) { s.pending = s.pending.filter((p) => p !== pend); return; } // it was thrown back
  if (!bodiesAt(s, 'player', pend.prov).length) {
    const P = s.prov[pend.prov];
    if (P.owner !== 'player' && (hostile(s, 'player', P.owner) || (P.owner === 'state' && s.emperor !== 'player'))) flipProvince(s, P, 'player', P.aux > 0);
    s.pending = s.pending.filter((p) => p !== pend);
  }
}

function withdraw(s, pend, A) {
  if (A.from && A.from !== A.loc) { A.loc = A.from; for (const id of A.legions) s.legions[id].loc = A.loc; }
  A.path = []; A.dest = null;
  s.pending = s.pending.filter((p) => p !== pend);
}

// ---------------------------------------------------------------- the field
function battleAct(s, a) {
  const b = s.battle;
  if (!b) return { error: 'No battle' };
  const me = b.sides[b.player], foe = b.player === 'att' ? 'def' : 'att';
  if (b.over && a.type !== 'battleRound') return { error: 'The battle is over' };
  switch (a.type) {
    case 'battleOrder': {
      if (!ORDERS.includes(a.order)) return { error: 'Unknown order' };
      const why = orderBlocked(me, a.sector, a.order);
      if (why) return { error: why };
      me.sectors[a.sector].order = a.order; return { ok: true };
    }
    case 'battleReserve':
      if (me.reserveUsed) return { error: 'The reserve is already committed' };
      if (a.sector !== null && me.sectors[a.sector].routed) return { error: 'That sector has broken' };
      me.reserveOrder = a.sector; return { ok: true };
    case 'battleCav': {
      const c = me.cav.find((x) => x.pos === a.pos);
      if (!c) return { error: 'No horse there' };
      if (a.order === 'pursue' && !b.sides[foe].sectors[a.pos].routed) return { error: 'Nobody is running yet' };
      if (a.order === 'charge' && c.end < 30) return { error: 'The horses are blown' };
      c.order = a.order; return { ok: true };
    }
    case 'battleLegate': {
      if (a.action === 'rally' && (me.rallyUsed || !me.sectors[a.target]?.routed)) return { error: me.rallyUsed ? 'You have already rallied once' : 'That sector stands' };
      if (a.action === 'ruse' && me.ruseUsed) return { error: 'They will not fall for it twice' };
      if (a.action === 'appeal' && me.sectors[a.target]?.dist !== 0) return { error: 'Too far to be heard: the lines must be close' };
      me.legate = { action: a.action, target: a.target ?? 1 }; return { ok: true };
    }
    case 'battleDusk':
      if (!b.dusk) return { error: 'It is not dusk' };
      decideDusk(b, !!a.fightOn);
      if (b.over) return finishBattle(s);
      return { ok: true };
    case 'battleRound': {
      if (b.over) return finishBattle(s);
      if (b.dusk) return { error: 'Night is falling: fight on or break off' };
      const r = streamFor(b.seed, b.turn * 100 + b.round, 'policy' + b.id);
      aiOrders(b, foe, r, b.sides[foe].general);
      b.log = [];
      resolveRound(b);
      me.legate = { action: 'stay', target: 1 };
      for (const c of me.cav) if (c.order === 'pursue') c.order = 'screen';
      return { ok: true, over: b.over };
    }
    case 'battleAuto': {
      autoBattle(b, { [b.player]: 'legates', [foe]: b.sides[foe].general });
      return finishBattle(s);
    }
  }
  return { error: 'Unknown' };
}

function finishBattle(s) {
  const b = s.battle;
  const playerWon = b.winner === b.player;
  const res = concludeBattle(s, b);
  s.lastBattle = { loc: b.loc, winner: b.winner, player: b.player, rounds: b.round };
  for (const pend of [...s.pending]) settle(s, pend);
  return { ok: true, result: b.winner === 'draw' ? 'draw' : playerWon ? 'won' : 'lost', campaign: res };
}

export function endMonth(s) {
  if (s.battle) { const b = s.battle; const foe = b.player === 'att' ? 'def' : 'att'; autoBattle(b, { [b.player]: 'legates', [foe]: b.sides[foe].general }); finishBattle(s); }
  // encounters left undecided: the army falls back
  for (const pend of [...s.pending]) { const A = s.armies[pend.army]; if (A) withdraw(s, pend, A); else s.pending = s.pending.filter((p) => p !== pend); }
  for (const o of s.offers) if (o.turn < s.turn) o.lapsed = true;
  const before = s.turn;
  step(s);
  return { ok: true, turn: s.turn, from: before };
}

