import { aiSenate, addFavour, isHostis } from './senate.js';
import { agreementGains, endTrade, makeTrade, tradeBetween } from './trade.js';
import { GOODS, PERSONALITY } from '../data/powers.js';
import { flipProvince } from './core.js';
import { addGeneral, formArmy } from './generals.js';
import { generalOf } from './combat.js';
// Diplomacy (docs/FRAME-DIPLOMACY.md). One set of functions for every faction:
// the player, the bot and the rivals propose, accept and break treaties the
// same way, and every answer comes with its reasons in words.
import { CLIENTS } from '../data/people.js';
import { distance, PROV } from './graph.js';
import { legionName, who, money, buyCost, hostile, log, newLegion, ownedLegions, ownedProvinces, strengthOf, takeLegion } from './core.js';

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export function standing(s, a, b) { return s.rel[key(a, b)] || 0; }
export function adjustStanding(s, a, b, d) {
  const k = key(a, b);
  s.rel[k] = Math.max(-100, Math.min(100, (s.rel[k] || 0) + d));
}

export function initDiplomacy(s) {
  s.rel = {};
  s.treaties = [];
  s.peace = {};
  s.offers = [];
  s.clientsUsed = {};
  s.nextTreaty = 1;
}

function rebuildPeace(s) {
  s.peace = {};
  for (const t of s.treaties) if (t.type === 'truce' || t.type === 'alliance') s.peace[key(t.a, t.b)] = t.id;
}

export function pruneTreaties(s) {
  const n = s.treaties.length;
  s.treaties = s.treaties.filter((t) => s.factions[t.a]?.alive && s.factions[t.b]?.alive);
  if (s.treaties.length !== n) rebuildPeace(s);
}

export function treatyBetween(s, a, b) { return s.treaties.find((t) => key(t.a, t.b) === key(a, b)); }

// Where a faction's strength is: its leader's army, else its base.
export function seat(s, F) {
  const A = F.leaderArmy && s.armies[F.leaderArmy];
  return A ? A.loc : (F.base || ownedProvinces(s, F.id)[0]?.id || 'ROM');
}

function rivalsOf(s, F) {
  return Object.values(s.factions).filter((x) => x.alive && x.id !== F.id && x.kind !== 'state' && x.kind !== 'barbarian');
}

// The biggest danger to X other than Y: strength of the strongest hostile faction within reach.
function otherThreat(s, X, Y) {
  let t = 0;
  for (const Z of rivalsOf(s, X)) {
    if (Z.id === Y.id || !hostile(s, X.id, Z.id)) continue;
    if (distance(seat(s, X), seat(s, Z)) > 4) continue;
    t = Math.max(t, strengthOf(s, Z.id));
  }
  return t;
}

function strongestClaimant(s) {
  let best = null, bs = -1;
  for (const f of Object.values(s.factions)) if (f.alive && (f.kind === 'hist' || f.kind === 'player')) { const x = strengthOf(s, f.id); if (x > bs) { bs = x; best = f.id; } }
  return best;
}

const canSubmit = (s, F) => F.kind === 'minor' || F.kind === 'proc' || (F.kind === 'hist' && s.actIVOpen) || F.kind === 'player';

// Would X accept Y's proposal? The same judgement for every faction.
// Returns { ok, score, reasons }.
export function evaluate(s, X, Y, type, target) {
  const reasons = [];
  const xs = Math.max(1, strengthOf(s, X.id)), ys = Math.max(1, strengthOf(s, Y.id));
  const st = standing(s, X.id, Y.id);
  const third = otherThreat(s, X, Y);
  const pers = PERSONALITY[X.id] || {};
  let score = st / 100 + 0.04 * Y.stats.auct + (Y.road === 'politics' ? 0.1 : 0) + (pers[type] || 0);
  if (isHostis(s, Y.id) && type !== 'submission') { score -= 0.1; reasons.push('the Senate has outlawed you'); }
  if (st >= 30) reasons.push('they think well of you'); else if (st <= -30) reasons.push('they distrust you');
  if (type === 'truce') {
    score += 0.35 * Math.min(2, ys / xs) + 0.35 * Math.min(2, third / xs);
    if (ys > xs * 1.2) reasons.push('you are stronger'); else if (ys < xs * 0.7) reasons.push('they are stronger and need nothing from you');
    if (third > xs) reasons.push('they fear another rival more than you');
    // nobody wants to give the front-runner a free hand
    const lead = strongestClaimant(s);
    if (lead === Y.id && s.diff.leaderBias !== undefined) { score -= 0.1 + 0.15 * (s.diff.truceReluctance || 0); reasons.push('you are the man to stop'); }
    return { ok: score >= 0.7, score, reasons };
  }
  if (type === 'alliance') {
    const T = s.factions[target];
    if (!T || !T.alive || !hostile(s, X.id, T.id)) return { ok: false, score: 0, reasons: ['they are not at war with him'] };
    const ts = strengthOf(s, T.id);
    score += 0.5 * Math.min(2, ts / xs) + (s.diff.leaderBias && ts >= Math.max(xs, ys) ? 0.25 : 0);
    if (ts > xs) reasons.push(`they fear ${T.name}`);
    return { ok: score >= 0.95, score, reasons };
  }
  if (type === 'trade') {
    if (!s.peace[key(X.id, Y.id)]) return { ok: false, score: 0, reasons: ['trade needs peace first: a truce or an alliance'] };
    const g = agreementGains(s, Y.id, X.id);
    if (!g.b.length) return { ok: false, score: 0, reasons: ['you have nothing he lacks'] };
    score += 0.35 + 0.12 * g.b.length - 0.04 * g.a.length;
    reasons.push(`he would get ${g.b.map((x) => GOODS[x].name.toLowerCase()).join(', ')}`);
    if (g.a.length > g.b.length) reasons.push('he sees you gain more than he does');
    return { ok: score >= 0.6, score, reasons };
  }
  if (type === 'cede') {
    const P = s.prov[target];
    if (!s.peace[key(X.id, Y.id)]) return { ok: false, score: 0, reasons: ['only a partner at peace can be asked'] };
    if (!P || P.owner !== X.id) return { ok: false, score: 0, reasons: ['not his province'] };
    if (P.id === X.base || P.id === 'ROM') return { ok: false, score: 0, reasons: ['he will not give up his seat'] };
    if (Object.values(s.legions).some((l) => l.loc === P.id && l.owner === X.id)) return { ok: false, score: 0, reasons: ['his legions stand there'] };
    const ratio = xs / ys;
    score += ratio < 0.3 ? 0.5 : ratio < 0.5 ? 0.15 : -0.6;
    reasons.push(ratio < 0.3 ? 'he cannot refuse you' : ratio < 0.5 ? 'he fears you' : 'he is strong enough to say no');
    return { ok: score >= 0.75, score, reasons };
  }
  if (type === 'submission') {
    if (!canSubmit(s, X)) return { ok: false, score: 0, reasons: ['he will not bend the knee before the last act'] };
    const ratio = xs / ys;
    const fresh = Y.recentWin !== undefined && s.turn - Y.recentWin <= 6;
    score += (ratio < 0.25 ? 0.6 : ratio < 0.5 ? 0.2 : -0.5) + (X.legit < Y.legit ? 0.15 : -0.1) + (fresh ? (Y.road === 'military' ? 0.3 : 0.1) : 0);
    if (fresh) reasons.push('your recent victory weighs on him');
    if (st < 10) { score -= 0.35; reasons.push('he does not trust you enough to put his life in your hands'); }
    if (ratio < 0.25) reasons.push('his cause is hopeless'); else reasons.push('he still has the men to fight');
    return { ok: score >= 0.75, score, reasons };
  }
  return { ok: false, score: 0, reasons: ['unknown proposal'] };
}

export function makeTreaty(s, a, b, type, opts = {}) {
  const t = { id: s.nextTreaty++, type, a, b, target: opts.target || null, hostages: !!opts.hostages, from: s.turn, until: type === 'submission' ? null : s.turn + (opts.months || 12) };
  if (type === 'submission') { submit(s, s.factions[b], s.factions[a]); return t; }
  s.treaties.push(t);
  rebuildPeace(s);
  adjustStanding(s, a, b, 15);
  if (s.factions[a].kind === 'player' || s.factions[b].kind === 'player') s.stats.treaties = (s.stats.treaties || 0) + 1;
  else s.stats.aiTreaties = (s.stats.aiTreaties || 0) + 1;
  log(s, `${type} ${a} ${b}`, null, `${type === 'alliance' ? 'An' : 'A'} ${type} is agreed between ${who(s, a)} and ${who(s, b).replace('You', 'you')}.`);
  return t;
}

// X submits to Y: his legions, provinces and money join Y. Y owes him an office,
// carried as a promise on the legions that came over.
export function submit(s, X, Y) {
  const legs = ownedLegions(s, X.id);
  for (const l of legs) { takeLegion(s, l, Y.id, 50); l.debt = 120; l.debtDue = s.turn + 4; }
  for (const P of ownedProvinces(s, X.id)) P.owner = Y.id;
  for (const A of Object.values(s.armies)) if (A.owner === X.id) delete s.armies[A.id];
  money(s, Y, Math.max(0, X.treasury), 'treasury of ' + X.name);
  // to a human: he keeps command of his main army, as your general
  if (Y.kind === 'player' && s.opts.human && legs.length) {
    const g = addGeneral(s, Y, { id: 'G-' + X.id, name: X.name, style: generalOf(X), skill: Math.max(1, Math.min(4, X.stats.virtus)), how: 'with his legions' });
    if (g) {
      const byLoc = {};
      for (const l of legs) (byLoc[l.loc] = byLoc[l.loc] || []).push(l.id);
      const [loc, ids] = Object.entries(byLoc).sort((a, b) => b[1].length - a[1].length)[0];
      formArmy(s, Y, loc, g.id, ids);
    }
  }
  X.alive = false; X.submittedTo = Y.id;
  if (s.emperor === X.id) s.emperor = null;
  s.treaties = s.treaties.filter((t) => t.a !== X.id && t.b !== X.id);
  rebuildPeace(s);
  if (Y.kind === 'player') s.stats.submissions = (s.stats.submissions || 0) + 1;
  log(s, `${X.id} submits to ${Y.id}`, null, `${X.name} submits to ${who(s, Y.id).replace('You', 'you')}, bringing ${legs.length} legion${legs.length === 1 ? '' : 's'}.`);
}

// Y proposes to X. Player-to-AI and AI-to-AI answer at once; AI-to-player
// waits for the player (human) or the bot.
export function propose(s, Y, X, type, opts = {}) {
  if (!X.alive || !Y.alive || X.id === Y.id) return { ok: false, reasons: ['no one to treat with'] };
  if (treatyBetween(s, X.id, Y.id) && !['submission', 'trade', 'cede'].includes(type)) return { ok: false, reasons: ['a treaty already stands'] };
  if (type === 'trade' && tradeBetween(s, X.id, Y.id)) return { ok: false, reasons: ['you already trade'] };
  const gold = opts.gold || 0;
  if (gold && Y.treasury < gold) return { ok: false, reasons: ['you have not got the gold'] };
  if (X.kind === 'player' && s.opts.human) {
    s.offers.push({ id: s.nextTreaty++, from: Y.id, type, target: opts.target || null, months: opts.months || 12, turn: s.turn });
    return { ok: null, reasons: ['sent'] };
  }
  const ev = X.kind === 'player' ? botAnswer(s, X, Y, type, opts) : evaluate(s, X, Y, type, opts.target);
  const bonus = (opts.hostages ? 0.15 : 0) + (gold ? (gold / 100) * 0.1 * ((PERSONALITY[X.id] || {}).giftMult ?? 1) : 0);
  if (gold) ev.reasons.push(`your gold weighs ${bonus >= 0.2 ? 'heavily' : 'a little'}`);
  const need = { alliance: 0.95, truce: 0.7, trade: 0.6, cede: 0.75 }[type] ?? 0.75;
  const ok = bonus && ev.score > 0 ? ev.score + bonus >= need || ev.ok : ev.ok;
  if (ok) {
    if (gold) money(s, Y, -gold, 'gold to ' + X.name);
    if (type === 'submission') submit(s, X, Y);
    else if (type === 'trade') makeTrade(s, Y.id, X.id);
    else if (type === 'cede') cede(s, X, Y, opts.target);
    else makeTreaty(s, Y.id, X.id, type, opts);
  } else adjustStanding(s, X.id, Y.id, type === 'cede' ? -10 : -3);
  return { ok, reasons: ev.reasons };
}

// The player's answer to an offer
export function answerOffer(s, offerId, accept) {
  const o = s.offers.find((x) => x.id === offerId);
  if (!o) return { error: 'No such offer' };
  s.offers = s.offers.filter((x) => x !== o);
  const Y = s.factions[o.from], P = s.factions.player;
  if (!Y.alive) return { error: 'He is dead' };
  if (!accept) { adjustStanding(s, P.id, Y.id, -5); return { ok: false }; }
  if (o.type === 'submission') submit(s, Y, P); // he offered to submit to you
  else if (o.type === 'trade') { if (!s.peace[key(Y.id, P.id)]) return { error: 'The peace has ended' }; makeTrade(s, Y.id, P.id); }
  else makeTreaty(s, Y.id, P.id, o.type, { target: o.target, months: o.months });
  return { ok: true };
}

export function breakTreaty(s, F, treatyId) {
  const t = s.treaties.find((x) => x.id === treatyId && (x.a === F.id || x.b === F.id));
  if (!t) return { error: 'No such treaty' };
  const other = t.a === F.id ? t.b : t.a;
  s.treaties = s.treaties.filter((x) => x !== t);
  rebuildPeace(s);
  endTrade(s, F.id, other); // war closes the roads now, not at the month's end
  F.legit = Math.max(0, F.legit - (t.hostages ? 15 : 6));
  addFavour(s, F.id, -4);
  adjustStanding(s, F.id, other, -50);
  for (const Z of rivalsOf(s, F)) if (Z.id !== other) adjustStanding(s, F.id, Z.id, -10);
  log(s, `${F.id} breaks ${t.type} with ${other}`, null, `${who(s, F.id)} ${F.kind === 'player' ? 'break' : 'breaks'} the ${t.type} with ${who(s, other).replace('You', 'you')}.`);
  return { ok: true };
}

export function giveGift(s, F, X, amount) {
  if (F.treasury < amount) return { error: 'Not enough money' };
  money(s, F, -amount, 'gift to ' + X.name);
  adjustStanding(s, F.id, X.id, (amount / 10) * (1 + 0.1 * F.stats.opes) * (F.road === 'charisma' ? 1.3 : 1) * ((PERSONALITY[X.id] || {}).giftMult ?? 1));
  return { ok: true };
}

// X gives province pid to Y, at peace, under pressure.
export function cede(s, X, Y, pid) {
  flipProvince(s, s.prov[pid], Y.id, true);
  adjustStanding(s, X.id, Y.id, -20);
  log(s, `${X.id} cedes ${pid} to ${Y.id}`, pid, `${X.name} gives up ${PROV[pid].name} to ${who(s, Y.id).replace('You', 'you')} rather than fight.`);
}

// Turn a rival's legion that is far from its general.
export function subvertCost(s, F, l) { return buyCost(s, F, { kind: 'legion', legion: l }) * 0.8 * (F.road === 'wealth' ? 0.8 : 1); }
export function canSubvert(s, F, l) {
  const X = s.factions[l.owner];
  if (!X || X.kind === 'state' || X.id === F.id) return 'Not a rival legion';
  if (l.army && l.army === X.leaderArmy) return 'It marches with its general';
  if (l.id === 'PRAET') return 'The Praetorians are bought only in Rome';
  if (F.treasury < subvertCost(s, F, l)) return 'Not enough money';
  return '';
}
export function subvert(s, F, l) {
  const why = canSubvert(s, F, l);
  if (why) return { error: why };
  money(s, F, -subvertCost(s, F, l), 'subverting ' + l.id);
  const r = s.R.events;
  const p = Math.max(0.05, Math.min(0.8, 0.2 + 0.05 * F.stats.gratia + (50 - l.loyalty) / 100));
  const X = s.factions[l.owner];
  const ok = r.chance(p);
  if (ok) { takeLegion(s, l, F.id, 40); l.bought = true; log(s, `${l.id} subverted by ${F.id}`, l.loc, `${legionName(l)} goes over to ${who(s, F.id).replace('You', 'you')}.`); }
  if (r.chance(0.3)) { adjustStanding(s, F.id, X.id, -40); F.legit = Math.max(0, F.legit - 3); log(s, `${X.id} discovers ${F.id}`, null, `${X.name} learns of ${F.kind === 'player' ? 'your' : F.name + "'s"} gold among his legions.`); return { ok, discovered: true }; }
  return { ok, discovered: false };
}

// Client kings
export function clientStatus(s, F, c) {
  if (s.clientsUsed[c.id]) return 'Already committed to a claimant';
  const holds = s.prov[c.near].owner === F.id;
  if (c.mustHold && !holds) return `Only for whoever holds ${c.near}`;
  if (!holds && !ownedProvinces(s, F.id).some((p) => distance(p.id, c.near) <= 1)) return 'Too far from his kingdom';
  if (F.treasury < c.cost) return 'Not enough money';
  return '';
}
export function askClient(s, F, cid) {
  const c = CLIENTS.find((x) => x.id === cid);
  const why = clientStatus(s, F, c);
  if (why) return { error: why };
  const st = standing(s, F.id, 'client:' + c.id);
  const near = rivalsOf(s, F).filter((Z) => (Z.kind === 'hist' || Z.kind === 'player') && distance(seat(s, Z), c.near) <= 3);
  const strongest = near.every((Z) => strengthOf(s, Z.id) <= strengthOf(s, F.id));
  if (st < 0 || (!strongest && st < 30)) return { ok: false, reasons: [strongest ? 'he does not trust you' : 'he backs a stronger man near him'] };
  money(s, F, -c.cost, 'subsidy to ' + c.name);
  s.clientsUsed[c.id] = F.id;
  newLegion(s, { station: c.near, loc: s.prov[c.near].owner === F.id ? c.near : ownedProvinces(s, F.id).sort((a, b) => distance(a.id, c.near) - distance(b.id, c.near))[0].id, group: c.group, men: c.men, exp: c.exp, owner: F.id, loyalty: 60, levy: true, payMult: 0.8, client: c.id });
  if (c.legit) F.legit = Math.max(0, F.legit + c.legit);
  if (F.kind === 'player') s.stats.clients = (s.stats.clients || 0) + 1;
  log(s, `client ${c.id} -> ${F.id}`, c.near, `${c.name.charAt(0).toUpperCase() + c.name.slice(1)} ${/^the /.test(c.name) ? 'send' : 'sends'} ${c.men} men to ${who(s, F.id).replace('You', 'you')}.`);
  return { ok: true };
}

// Monthly: treaties expire; AI factions make proposals by the same rules.
export function diplomacyTurn(s) {
  if (s.opts.noDiplomacy) return;
  const before = s.treaties.length;
  s.treaties = s.treaties.filter((t) => (t.until === null || t.until > s.turn) && s.factions[t.a].alive && s.factions[t.b].alive);
  if (s.treaties.length !== before) rebuildPeace(s);
  s.offers = s.offers.filter((o) => o.turn >= s.turn - 1 && s.factions[o.from]?.alive); // unanswered offers lapse
  const r = s.R.ai;
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian' || F.kind === 'player') continue;
    if (!r.chance(0.3)) continue;
    // partners at peace trade, if both gain
    if (!(s.opts.noTrade)) for (const Z of rivalsOf(s, F)) {
      if (!s.peace[key(F.id, Z.id)] || tradeBetween(s, F.id, Z.id) || !r.chance(0.3)) continue;
      if (!agreementGains(s, F.id, Z.id).a.length) continue;
      if (Z.kind === 'player' && s.opts.human) s.offers.push({ id: s.nextTreaty++, from: F.id, type: 'trade', turn: s.turn });
      else propose(s, F, Z, 'trade');
      break;
    }
    const mine = Math.max(1, strengthOf(s, F.id));
    const near = rivalsOf(s, F).filter((Z) => hostile(s, F.id, Z.id) && distance(seat(s, F), seat(s, Z)) <= 4);
    if (!near.length) continue;
    near.sort((a, b) => strengthOf(s, b.id) - strengthOf(s, a.id));
    const big = near[0];
    if ((F.kind === 'minor' || F.kind === 'proc') && mine < 0.25 * strengthOf(s, big.id) && (big.kind === 'hist' || big.kind === 'player') && standing(s, F.id, big.id) >= 10 && r.chance(0.5)) {
      if (big.kind === 'player') offerSubmission(s, F, big);
      else if (evaluate(s, F, big, 'submission').ok) submit(s, F, big);
      continue;
    }
    if (strengthOf(s, big.id) > mine * 1.3) {
      // a truce with someone else, to face the big one; or an alliance against him
      const other = near.find((Z) => Z.id !== big.id && hostile(s, Z.id, big.id));
      if (other && (s.diff.leaderBias || r.chance(0.5))) propose(s, F, other, 'alliance', { target: big.id });
      else if (other) propose(s, F, other, 'truce', { months: 6 });
      else if (big.kind !== 'player' || r.chance(0.5)) propose(s, F, big, 'truce', { months: 6 });
    }
    // clients for whoever can reach them
    for (const c of CLIENTS) if (!c.mustHold && !clientStatus(s, F, c) && F.treasury > c.cost * 2 && r.chance(0.3)) askClient(s, F, c.id);
  }
}

function offerSubmission(s, F, P) {
  if ((s.opts.dipOff || []).includes('offers')) return;
  if (s.opts.human) s.offers.push({ id: s.nextTreaty++, from: F.id, type: 'submission', turn: s.turn });
  else submit(s, F, P); // the bot always accepts men
}

// The bot's answers to offers made to it
function botAnswer(s, P, Y, type) {
  if (type === 'trade') return { ok: !!s.peace[key(P.id, Y.id)], score: 1, reasons: [] };
  if (type === 'truce') { const ok = strengthOf(s, Y.id) >= strengthOf(s, P.id) * 0.8; return { ok, score: ok ? 1 : 0, reasons: [] }; }
  if (type === 'alliance') return { ok: true, score: 1, reasons: [] };
  return { ok: false, score: 0, reasons: [] };
}

// The bot's own diplomacy (measurement): decree, clients, truce with the
// strongest neighbour when weaker, alliances against the leader.
export function botDiplomacy(s, P) {
  if (s.opts.noDiplomacy || s.opts.noPlayerDiplomacy) return;
  const off = s.opts.dipOff || [];
  if (!off.includes('decree') && !s.opts.noPlayerSenate) aiSenate(s, P);
  if (!off.includes('clients')) for (const c of CLIENTS) if (!clientStatus(s, P, c) && P.treasury > c.cost + 200 && (!c.legit || P.road === 'military')) askClient(s, P, c.id);
  const near = rivalsOf(s, P).filter((Z) => hostile(s, P.id, Z.id) && distance(seat(s, P), seat(s, Z)) <= 3 && Z.kind !== 'barbarian');
  // a partner at peace who is much weaker: ask for a neighbouring province
  if (!(s.opts.noBotLever || []).includes('cede') && !(P.lastCede > s.turn - 4)) {
    for (const Z of rivalsOf(s, P)) {
      if (!s.peace[key(P.id, Z.id)] || strengthOf(s, Z.id) > 0.5 * strengthOf(s, P.id)) continue;
      const q = ownedProvinces(s, Z.id).find((x) => x.id !== Z.base && x.id !== 'ROM' && !Object.values(s.legions).some((l) => l.loc === x.id && l.owner === Z.id) && ownedProvinces(s, P.id).some((m) => distance(m.id, x.id) <= 1));
      if (q) { P.lastCede = s.turn; propose(s, P, Z, 'cede', { target: q.id }); break; }
    }
  }
  if (!near.length) return;
  near.sort((a, b) => strengthOf(s, b.id) - strengthOf(s, a.id));
  const big = near[0];
  if (!off.includes('truce') && strengthOf(s, big.id) > strengthOf(s, P.id) && s.prov.ROM.owner !== 'player') {
    const other = near.find((Z) => Z.id !== big.id && hostile(s, Z.id, big.id));
    if (other) propose(s, P, other, 'alliance', { target: big.id });
    else {
      const r0 = propose(s, P, big, 'truce', { months: 6 });
      // refused: try again with gold in hand, if there is gold to spare
      if (r0.ok === false && !off.includes('gold') && !(s.opts.noBotLever || []).includes('gold') && P.treasury > 700) propose(s, P, big, 'truce', { months: 6, gold: 150 });
    }
  }
  const weak = near.filter((Z) => canSubmit(s, Z) && Z.kind !== 'player' && strengthOf(s, Z.id) < 0.3 * strengthOf(s, P.id));
  if (!off.includes('submission') && !(P.lastDemand > s.turn - 3)) for (const Z of weak.slice(0, 1)) { P.lastDemand = s.turn; if (standing(s, P.id, Z.id) < 10 && P.treasury > 300) giveGift(s, P, Z, 80); propose(s, P, Z, 'submission'); }
  if (P.road === 'politics' || P.road === 'charisma') {
    const tgt = near.find((Z) => standing(s, P.id, Z.id) < 20 && Z.kind !== 'hist');
    if (tgt && P.treasury > 400) giveGift(s, P, tgt, 60);
  }
}

