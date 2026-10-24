import { CONFIG, FIGHT_RATIO, NEG_THRESHOLD, ROAD_PREFS } from './config.js';
import { ADJ } from './graph.js';
import { money, armyPower, bodyGroup, bodyLoyalty, bodyMen, bodyPower, buyCost, cull, debtTotal, flipProvince, gainBody, hostile, killFaction, log, negotiateChance, ownedLegions, retreatLegion, setAside, takeLegion } from './core.js';
import { hold } from './rome.js';

// One resolver for encounters. The four options are separate functions; the
// bot's resolveEncounter and the player's chooseOption both call them, so hand
// play, AI and measurement can never disagree about what an option does.

// What each option needs and costs, for the screen and for the bot.
// Never says what will happen; only what it takes.
export function optionInfo(s, F, A, b, ctx = {}) {
  const myPower = A ? armyPower(s, A) : ctx.power;
  const ratio = myPower / Math.max(1, bodyPower(s, b));
  const cost = buyCost(s, F, b);
  const neg = negotiateChance(s, F, b, ratio);
  const holder = b.legion || b.town || b.prov || b.army;
  const unbuyable = b.kind === 'army' || b.kind === 'town' || b.kind === 'raid';
  return {
    ratio,
    buy: {
      ok: !unbuyable && bodyLoyalty(s, b) < 85 && F.treasury >= cost,
      why: unbuyable ? (b.kind === 'town' ? 'Towns cannot be bought' : b.kind === 'raid' ? 'Raiders take no money' : 'A whole army cannot be bought; buy its legions before battle') : bodyLoyalty(s, b) >= 85 ? 'Too loyal to be bought' : F.treasury < cost ? 'Not enough money' : '',
      cost, promise: cost * CONFIG.promiseMult,
      promiseOk: !unbuyable && bodyLoyalty(s, b) < 85,
    },
    negotiate: {
      ok: b.kind !== 'raid' && (holder.negTried || {})[F.id] !== s.turn,
      why: b.kind === 'raid' ? 'Raiders do not talk' : (holder.negTried || {})[F.id] === s.turn ? 'Already tried this month' : '',
      chance: neg.p, kind: neg.kind,
    },
    fight: { ok: true, why: '', ratio },
    bypass: {
      ok: !(b.kind === 'army' || b.kind === 'raid' || ctx.destination || !A),
      why: b.kind === 'army' ? 'An army will not let you pass' : b.kind === 'raid' ? 'Raiders must be driven off' : ctx.destination ? 'This is where you are going' : !A ? 'No army on the march' : '',
    },
  };
}

export function doBuy(s, F, A, b, ctx, promise) {
  const isPlayer = F.kind === 'player';
  const cost = buyCost(s, F, b);
  if (!promise) money(s, F, -cost, "bought " + (b.legion ? b.legion.id : "a garrison"));
  s.stats.buys += isPlayer ? 1 : 0;
  if (isPlayer) s.stats.gainedBy.buy++;
  if (promise) gainBody(s, F, b, 36 + 2 * F.stats.opes, cost * CONFIG.promiseMult, true);
  else gainBody(s, F, b, 40 + 2 * F.stats.opes, 0, true);
  if (ctx.act1) F.suspicion += 8 * s.diff.suspicionMult;
  log(s, `${F.id} ${promise ? 'promises money to' : 'buys'} ${b.legion ? b.legion.id : b.prov ? 'the garrison of ' + b.prov.id : 'them'}`, b.legion ? b.legion.loc : b.prov?.id);
  return 'cleared';
}

export function markNegotiation(s, F, b) {
  const holder = b.legion || b.town || b.prov || b.army;
  holder.negTried = holder.negTried || {};
  holder.negTried[F.id] = s.turn;
}

export function doNegotiate(s, F, A, b, ctx) {
  const isPlayer = F.kind === 'player';
  const myPower = A ? armyPower(s, A) : ctx.power;
  const ratio = myPower / Math.max(1, bodyPower(s, b));
  const { p } = negotiateChance(s, F, b, ratio);
  if (isPlayer) s.stats.negs++;
  if (ctx.act1) F.suspicion += 5 * s.diff.suspicionMult;
  const roll = s.R.combat.next();
  if (roll < p) {
    if (isPlayer) { s.stats.negOK++; s.stats.gainedBy.negotiate++; }
    gainBody(s, F, b, 55 + 3 * Math.max(F.stats.auct, F.stats.gratia), 0);
    F.legit = Math.min(100, F.legit + 1);
    return 'cleared';
  }
  if (roll < p + (1 - p) * 0.35 && b.kind !== 'army') {
    setAside(s, F, b, 3);
    return 'aside';
  }
  F.legit = Math.max(0, F.legit - 1);
  return 'refused';
}

export function doBypass(s, F, A, b) {
  if (F.kind === 'player') s.stats.bypasses++;
  setAside(s, F, b, 1);
  A.bypassed = (A.bypassed || 0) + 1;
  return 'aside';
}

// The bot (and every AI faction): its road's preferences, gated by thresholds.
// F meets body b (with its army A, or as an Act I approach when A is null).
// Returns 'cleared' | 'aside' | 'blocked' | 'lost'.
export function resolveEncounter(s, F, A, b, ctx = {}) {
  const prefs = (F.allowed ? ROAD_PREFS[F.road].filter((o) => F.allowed.includes(o)) : ROAD_PREFS[F.road]);
  const myPower = A ? armyPower(s, A) : ctx.power;
  const ratio = myPower / Math.max(1, bodyPower(s, b));
  const reserve = ownedLegions(s, F.id).reduce((a, l) => a + l.men * CONFIG.payPerMan * l.payMult, 0);
  const aggr = F.kind === 'player' ? 1 : s.diff.aiAggr;
  const racing = A && A.dest === 'ROM' && !ctx.destination && (b.kind === 'town' || b.kind === 'aux');
  const order = racing && prefs.includes('bypass') ? ['bypass', ...prefs.filter((o) => o !== 'bypass')] : prefs;
  for (const opt of order) {
    if (opt === 'buy') {
      if (bodyLoyalty(s, b) >= 85 || b.kind === 'army' || b.kind === 'town' || b.kind === 'raid') continue;
      const cost = buyCost(s, F, b);
      const cap = F.road === 'wealth' ? 0.9 : 0.5;
      if (cost <= (F.treasury - reserve) * cap * aggr) return doBuy(s, F, A, b, ctx, false);
      const promiseCap = (1 + F.stats.opes) * 220;
      if ((F.road === 'wealth' || F.road === 'charisma' || !A) && debtTotal(s, F.id) + cost * CONFIG.promiseMult <= promiseCap * aggr) return doBuy(s, F, A, b, ctx, true);
    } else if (opt === 'negotiate') {
      const holder = b.legion || b.town || b.prov || b.army;
      holder.negTried = holder.negTried || {};
      if (holder.negTried[F.id] === s.turn || b.kind === 'raid') continue;
      holder.negTried[F.id] = s.turn;
      const { p } = negotiateChance(s, F, b, ratio);
      if (p < NEG_THRESHOLD[F.road] && !(F.allowed && F.allowed.length === 1)) continue;
      const r = doNegotiate(s, F, A, b, ctx);
      if (r !== 'refused') return r;
    } else if (opt === 'fight') {
      const need = F.allowed && F.allowed.length === 1 ? 0.9 : FIGHT_RATIO[F.road] / Math.max(0.6, aggr);
      if (ratio < need) continue;
      if (ctx.act1 && F.kind === 'player') F.suspicion += 30 * s.diff.suspicionMult;
      return fight(s, F, A, b, ctx);
    } else if (opt === 'bypass') {
      if (b.kind === 'army' || b.kind === 'raid' || ctx.destination || !A) continue;
      return doBypass(s, F, A, b);
    }
  }
  // nothing chosen: fight if not hopeless, else hold back
  if (ratio >= 1.0 && (!F.allowed || F.allowed.includes('fight') || F.allowed.length === 1)) return fight(s, F, A, b, ctx);
  return 'blocked';
}

// The player's own choice. Returns the result, or { error } if the option is
// not available (the screen should never offer it, but the engine checks).
export function chooseOption(s, F, A, b, opt, ctx = {}) {
  const info = optionInfo(s, F, A, b, ctx);
  if (opt === 'buy' || opt === 'promise') {
    if (opt === 'buy' && !info.buy.ok) return { error: info.buy.why };
    if (opt === 'promise' && !info.buy.promiseOk) return { error: info.buy.why };
    return doBuy(s, F, A, b, ctx, opt === 'promise');
  }
  if (opt === 'negotiate') {
    if (!info.negotiate.ok) return { error: info.negotiate.why };
    markNegotiation(s, F, b);
    return doNegotiate(s, F, A, b, ctx);
  }
  if (opt === 'fight') {
    if (ctx.act1) F.suspicion += 30 * s.diff.suspicionMult;
    return fight(s, F, A, b, ctx);
  }
  if (opt === 'bypass') {
    if (!info.bypass.ok) return { error: info.bypass.why };
    return doBypass(s, F, A, b);
  }
  return { error: 'Unknown option' };
}

export function fight(s, F, A, b, ctx) {
  const r = s.R.combat;
  const defOwner = b.kind === 'army' ? b.army.owner : b.kind === 'legion' ? b.legion.owner : b.kind === 'raid' ? 'barbarians' : b.prov.owner;
  const D = s.factions[defOwner];
  // pre-battle defections (charisma), same rule both ways
  if (b.kind === 'army' && A) {
    for (const id of [...b.army.legions]) { const l = s.legions[id]; if (l.loyalty < (F.road === 'charisma' ? 58 : 45) && r.chance(0.045 * F.stats.gratia)) takeLegion(s, l, F.id, 45), A.legions.push(id), l.army = A.id, l.loc = A.loc; }
    for (const id of [...A.legions]) { const l = s.legions[id]; if (l.loyalty < (D.road === 'charisma' ? 58 : 45) && r.chance(0.045 * D.stats.gratia)) takeLegion(s, l, D.id, 45), b.army.legions.push(id), l.army = b.army.id, l.loc = b.army.loc; }
    for (const [X, Y, YA] of [[F, D, b.army], [D, F, A]]) {
      if (X.stats.opes < 3) continue;
      const target = YA.legions.map((id) => s.legions[id]).filter((l) => l.loyalty < 50).sort((a, c) => a.loyalty - c.loyalty)[0];
      if (!target) continue;
      const cost = target.men * CONFIG.buyPerMan * (0.5 + target.loyalty / 100) * 1.2 / (1 + 0.08 * X.stats.opes);
      if (X.treasury > cost * 1.5) {
        money(s, X, -cost, 'bought ' + target.id + ' before battle');
        const XA = X === F ? A : b.army;
        takeLegion(s, target, X.id, 40); target.bought = true; target.army = XA.id; target.loc = XA.loc; XA.legions.push(target.id);
        log(s, `${X.id} buys ${target.id} from ${Y.id} before the battle`);
      }
    }
    if (!b.army.legions.length) return 'cleared';
    if (!A.legions.length) return 'lost';
  }
  if (b.kind === 'army' && A) {
    const ratioD = bodyPower(s, b) / Math.max(1, armyPower(s, A));
    const back = ADJ[b.army.loc].map((e) => e.to).find((p) => s.prov[p].owner === b.army.owner && !Object.values(s.armies).some((x) => x.loc === p && hostile(s, x.owner, b.army.owner)));
    if (ratioD < 0.75 && back && r.chance(0.7)) {
      b.army.loc = back; b.army.path = []; for (const id of b.army.legions) s.legions[id].loc = back;
      log(s, `${b.army.owner} withdraws from ${A.loc} before ${F.id}`);
      return 'cleared';
    }
  }
  const attMen = A ? A.legions.reduce((a, id) => a + s.legions[id].men, 0) : ctx.men;
  const defMen = bodyMen(s, b);
  const large = attMen + defMen >= CONFIG.largeBattleMen && b.kind === 'army';
  const isPlayer = F.kind === 'player' || D.kind === 'player';
  if (large) { s.stats.largeFights++; if (isPlayer) s.stats.pLarge++; } else { s.stats.smallFights++; if (isPlayer) s.stats.pSmall++; }
  const pa = (A ? armyPower(s, A) : ctx.power) * r.float(0.85, 1.15);
  const pd = bodyPower(s, b) * r.float(0.85, 1.15);
  const attWins = pa > pd;
  if (isPlayer || large) log(s, `${large ? 'BATTLE' : 'fight'} ${F.id}(${Math.round(pa)}) vs ${D.id} ${b.kind}(${Math.round(pd)}) at ${A ? A.loc : 'camp'} -> ${attWins ? F.id : D.id}`);
  const lw = attWins ? pd / pa : pa / pd;
  const loserCas = r.float(0.22, 0.38), winnerCas = r.float(0.05, 0.12) * lw;
  const vA = F.stats.virtus, vD = D.stats.virtus;
  const casA = (attWins ? winnerCas : loserCas) * (1 - 0.045 * vA);
  const casD = (attWins ? loserCas : winnerCas) * (1 - 0.045 * vD);
  const attLegs = A ? A.legions.map((id) => s.legions[id]) : (ctx.legions || []);
  for (const l of attLegs) l.men = Math.round(l.men * (1 - casA));
  if (b.kind === 'army') for (const id of b.army.legions) s.legions[id].men = Math.round(s.legions[id].men * (1 - casD));
  else if (b.kind === 'legion') b.legion.men = Math.round(b.legion.men * (1 - casD));
  else if (b.kind === 'town' || b.kind === 'raid') (b.town || b.raid).men = Math.round((b.town || b.raid).men * (1 - casD));
  else b.prov.aux = Math.round(b.prov.aux * (1 - casD));
  // comrades fighting comrades
  const g = bodyGroup(s, b);
  for (const l of attLegs) if (l.group === g) l.loyalty -= 4;
  const winner = attWins ? F : D, loser = attWins ? D : F;
  if (winner.kind === 'player') s.stats.fightsWon++;
  if (loser.kind === 'player') s.stats.fightsLost++;
  winner.legit = Math.min(100, winner.legit + (large ? (winner.road === 'military' ? 7 : 4) : 1));
  if (large) winner.recentWin = s.turn;
  loser.legit = Math.max(0, loser.legit - (large ? 6 : 2));
  const winLegs = attWins ? attLegs : (b.kind === 'army' ? b.army.legions.map((id) => s.legions[id]) : b.kind === 'legion' ? [b.legion] : []);
  for (const l of winLegs) l.loyalty = Math.min(100, l.loyalty + (large ? 8 : 4));
  cull(s);
  if (attWins) {
    if (F.kind === 'player') s.stats.gainedBy.fight++;
    if (b.kind === 'army') defeatArmy(s, b.army, F, A, large);
    else if (b.kind === 'legion' && s.legions[b.legion.id]) {
      const l = b.legion;
      if (r.chance(0.5)) { takeLegion(s, l, F.id, 30); if (A) { l.army = A.id; l.loc = A.loc; A.legions.push(l.id); } }
      else retreatLegion(s, l);
    } else if (b.kind === 'aux') {
      b.prov.aux = 0;
      if ((A || ctx.act1) && !b.prov.towns.some((t) => t.men > 0)) flipProvince(s, b.prov, F.id, false);
    } else if (b.kind === 'town') {
      // stormed and sacked: plunder for the men, a stain on the name
      b.town.men = 0;
      if (A) A.wait = 1;
      money(s, F, 40 + b.town.base * 0.05, "plunder");
      for (const l of attLegs) if (s.legions[l.id]) l.loyalty = Math.min(100, l.loyalty + 3);
      F.legit = Math.max(0, F.legit - 1);
      b.prov.unrest = Math.min(100, b.prov.unrest + 20);
    } else if (b.kind === 'raid') {
      b.raid.men = 0;
    }
    return 'cleared';
  }
  // attacker lost
  for (const l of attLegs) if (s.legions[l.id]) l.loyalty -= 8;
  if (A) {
    if (A.id === F.leaderArmy) leaderDefeated(s, F, A, large);
    if (s.armies[A.id] && A.from) { A.loc = A.from; A.path = []; }
  }
  return 'lost';
}

export function defeatArmy(s, D, F, A, large) {
  const owner = s.factions[D.owner];
  const r = s.R.combat;
  for (const id of [...D.legions]) {
    const l = s.legions[id];
    if (!l) continue;
    if (r.chance((large ? 0.45 : 0.35) + (F.road === 'military' ? 0.2 : 0))) { takeLegion(s, l, F.id, 30); if (A) { l.army = A.id; l.loc = A.loc; A.legions.push(l.id); } }
  }
  if (D.id === owner.leaderArmy) leaderDefeated(s, owner, D, large);
  if (s.armies[D.id]) {
    const back = ADJ[D.loc].map((e) => e.to).find((p) => s.prov[p].owner === D.owner);
    if (back) { D.loc = back; D.path = []; for (const id of D.legions) s.legions[id].loc = back; }
    else for (const id of [...D.legions]) retreatLegion(s, s.legions[id]);
  }
}

export function leaderDefeated(s, F, A, large) {
  const r = s.R.combat;
  const canRetreat = ADJ[A.loc].some((e) => s.prov[e.to].owner === F.id) || s.prov[A.loc].owner === F.id;
  const pDeath = (large ? 0.3 : 0.05) + (canRetreat ? 0 : 0.5);
  if (r.chance(pDeath)) {
    if (F.anchored && !s.actIVOpen) { s.stats.anchorSaves++; return; }
    killFaction(s, F, 'death');
  }
}
