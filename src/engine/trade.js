// Trade (docs/FRAME-DEPTH.md): goods, markets and trade agreements. The same
// rules for every faction. A faction holds a good if it owns a province that
// makes it, or has an agreement with someone who does (no re-export), or (luxuries)
// the Parthian friendship.
import { GOODS, GOOD_IDS, PRODUCES } from '../data/powers.js';
import { ADJ, PROV } from './graph.js';
import { has } from './buildings.js';
import { log, who } from './core.js';

export const MARKET = 6;          // k a month for each good each province brings to market
export const HARBOUR_BONUS = 0.3; // a harbour sends more of it by sea
export const AGREEMENT = 10;      // k a month for each good an agreement brings that you lacked
export const SILK_ROAD = 25;      // k a month for the Parthian friend who holds Syria

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const coastal = (pid) => ADJ[pid].some((e) => e.kind === 'sea');

export function initTrade(s) { if (!s.trade) s.trade = []; }

// Goods from a faction's own provinces (a province in revolt or breached sells nothing).
// What a province brings to market now (a flooded mine sells no metal).
export function producesNow(s, P) {
  const g = PRODUCES[P.id] || [];
  return (P.mineClosedUntil ?? -1) > s.turn ? g.filter((x) => x !== 'metal') : g;
}
export function goodsOwned(s, fid) {
  const out = new Set();
  for (const P of Object.values(s.prov)) if (P.owner === fid && P.breachUntil <= s.turn && P.unrest <= 85) for (const g of producesNow(s, P)) out.add(g);
  return out;
}

export function partnersOf(s, fid) {
  return (s.trade || []).filter((t) => t.a === fid || t.b === fid).map((t) => (t.a === fid ? t.b : t.a));
}

export function goodsOf(s, fid) {
  if (s.opts.noTrade) return new Set();
  const out = goodsOwned(s, fid);
  for (const x of partnersOf(s, fid)) for (const g of goodsOwned(s, x)) out.add(g);
  if (s.foreign && s.foreign.parthia === fid && s.prov.SYR.owner === fid) out.add('luxury');
  return out;
}
export function hasGood(s, fid, g) { return !s.opts.noTrade && s.opts.noGood !== g && goodsOf(s, fid).has(g); }

// Merchant income a month, with its parts (for the screens).
export function tradeIncome(s, fid) {
  if (s.opts.noTrade) return { total: 0, market: 0, agreements: 0, silk: 0 };
  let market = 0;
  for (const P of Object.values(s.prov)) {
    if (P.owner !== fid || P.breachUntil > s.turn || P.unrest > 85) continue;
    const n = producesNow(s, P).length;
    market += n * MARKET * (has(P, 'harbour') && coastal(P.id) ? 1 + HARBOUR_BONUS : 1) * (P.unrest > 60 ? 0.5 : 1);
  }
  const own = goodsOwned(s, fid);
  let agreements = 0;
  for (const x of partnersOf(s, fid)) { const theirs = goodsOwned(s, x); for (const g of theirs) if (!own.has(g)) agreements += AGREEMENT; }
  const silk = s.foreign && s.foreign.parthia === fid && s.prov.SYR.owner === fid ? SILK_ROAD : 0;
  // pirates halve what goes by sea; lower tolls bring more ships
  const F = s.factions[fid];
  const mult = ((F.piracyUntil ?? -1) > s.turn ? 0.5 : 1) * ((F.tollsLowUntil ?? -1) > s.turn ? 1.3 : 1);
  return { total: (market + agreements + silk) * mult, market: market * mult, agreements: agreements * mult, silk: silk * mult };
}

// What an agreement between a and b would give each side (goods they lack).
export function agreementGains(s, a, b) {
  const A = goodsOwned(s, a), B = goodsOwned(s, b);
  return { a: [...B].filter((g) => !A.has(g)), b: [...A].filter((g) => !B.has(g)) };
}

export function tradeBetween(s, a, b) { return (s.trade || []).find((t) => key(t.a, t.b) === key(a, b)); }

export function makeTrade(s, a, b) {
  initTrade(s);
  if (tradeBetween(s, a, b)) return;
  s.trade.push({ a, b, from: s.turn });
  if (s.factions[a].kind === 'player' || s.factions[b].kind === 'player') s.stats.tradeDeals = (s.stats.tradeDeals || 0) + 1;
  log(s, `trade ${a} ${b}`, null, `A trade agreement is made between ${who(s, a)} and ${who(s, b).replace('You', 'you')}. Merchants cross the lines.`);
}

// Monthly: agreements end with peace (war closes the roads and the ports).
export function tradeTurn(s) {
  initTrade(s);
  const keep = [];
  for (const t of s.trade) {
    const alive = s.factions[t.a]?.alive && s.factions[t.b]?.alive;
    if (alive && s.peace[key(t.a, t.b)]) keep.push(t);
    else if (alive) log(s, `trade ends ${t.a} ${t.b}`, null, `The trade between ${who(s, t.a)} and ${who(s, t.b).replace('You', 'you')} ends with the peace.`);
  }
  s.trade = keep;
  // slow effects of goods
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian') continue;
    if (hasGood(s, F.id, 'luxury')) F.legit = Math.min(100, F.legit + 0.3);
  }
}

// Effect hooks read by the rest of the engine
export const levyGoodMult = (s, fid) => (hasGood(s, fid, 'metal') ? 0.8 : 1);
export const levyGoodExp = (s, fid) => (hasGood(s, fid, 'metal') ? 0.05 : 0);
export const cavalryGoodMult = (s, fid) => (hasGood(s, fid, 'horses') ? 1.25 : 1);
export const smallFightGoodMult = (s, fid) => (hasGood(s, fid, 'horses') ? 1.04 : 1);
export const buildGoodMult = (s, fid) => (hasGood(s, fid, 'timber') ? 0.8 : 1);
export const supplyGoodMult = (s, fid) => (hasGood(s, fid, 'grain') ? 0.5 : 1);
export const loyaltyGood = (s, fid) => (hasGood(s, fid, 'wine') ? 0.3 : 0);
export const gamesGoodMult = (s, fid) => (hasGood(s, fid, 'luxury') ? 0.75 : 1);

export function goodsView(s, fid) {
  const own = goodsOwned(s, fid), all = goodsOf(s, fid);
  return GOOD_IDS.map((g) => ({
    id: g, name: GOODS[g].name, does: GOODS[g].does, held: all.has(g), own: own.has(g),
    from: own.has(g) ? Object.values(s.prov).filter((P) => P.owner === fid && (PRODUCES[P.id] || []).includes(g)).map((P) => PROV[P.id].name)
      : all.has(g) ? partnersOf(s, fid).filter((x) => goodsOwned(s, x).has(g)).map((x) => who(s, x)).concat(g === 'luxury' && s.foreign?.parthia === fid ? ['Parthia'] : []) : [],
  }));
}
