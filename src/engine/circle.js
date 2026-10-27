// Your circle: the men who govern your provinces and command your armies.
// One pool for both jobs, as in Rome, where a province's legate usually also
// commanded its legions. Every faction keeps one (rivals and the measurement
// bot play by the same rules). Each man draws a salary, has two skills, a
// governing trait and a battle style, and his own loyalty and ambition.
// docs/DESIGN.md §19.
import { TRAITS } from '../data/buildings.js';
import { PROV, distance } from './graph.js';
import { legateName, log, money, newFaction, takeLegion, makeArmy, flipProvince, strengthOf } from './core.js';
import { CONFIG } from './config.js';

export const MAX_CIRCLE = 8; // men in a faction's circle: governors, generals and staff
export const STYLES = ['methodical', 'cautious', 'impetuous', 'cunning'];
const TRAIT_KEYS = Object.keys(TRAITS);
const AMBITION = { ambitious: 75, greedy: 45, able: 40, honest: 20, timid: 10 };

function hash(t) { let h = 0x811c9dc5; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; }

// A man, made from a key alone (draws nothing from the random streams).
export function makeMan(key, over = {}) {
  const h = hash(key);
  const trait = over.trait || TRAIT_KEYS[(h >>> 3) % TRAIT_KEYS.length];
  const man = {
    id: over.id || 'M' + (h % 1e8).toString(36),
    name: over.name || legateName(key),
    origin: over.origin || 'local',
    admin: over.admin ?? 1 + ((h >>> 7) % 4),
    command: over.command ?? 1 + ((h >>> 11) % 4),
    trait, style: over.style || STYLES[(h >>> 15) % 4],
    loyalty: over.loyalty ?? 55,
    ambition: over.ambition ?? AMBITION[trait] ?? 30,
    since: over.since ?? 0,
  };
  if (over.friend) man.friend = over.friend;
  return man;
}

export const circleOf = (F) => (F.circle = F.circle || []);
export const memberById = (F, id) => (F.circle || []).find((m) => m.id === id) || null;
export const governorOf = (s, P) => (P.governor?.cid ? memberById(s.factions[P.owner] || {}, P.governor.cid) : null);

// Where a man serves: a province he governs, an army he commands, or neither.
export function postOf(s, F, m) {
  const pid = Object.keys(s.prov).find((k) => s.prov[k].owner === F.id && s.prov[k].governor?.cid === m.id);
  if (pid) return { gov: pid };
  const A = Object.values(s.armies).find((x) => x.owner === F.id && x.general === m.id && x.legions.length);
  if (A) return { gen: A.id };
  return null;
}

// Salary a month (k denarii): skill, and the post he holds.
export function salaryOf(s, F, m) {
  const base = 3 + 1.5 * Math.max(m.admin, m.command) + (m.trait === 'honest' ? 2 : 0);
  const post = postOf(s, F, m);
  if (!post) return base / 2; // on your staff
  if (post.gov) return base + PROV[post.gov].rev / 50; // Asia and Africa paid their governors best
  return base + Math.min(6, s.armies[post.gen].legions.length);
}
export const payroll = (s, F) => circleOf(F).reduce((a, m) => a + salaryOf(s, F, m), 0);

export function addMember(s, F, man, how) {
  const C = circleOf(F);
  if (C.length >= MAX_CIRCLE) return null;
  if (C.some((m) => m.id === man.id)) return null;
  // no two men of the same name in one household
  for (let i = 1; C.some((m) => m.name === man.name) && i < 9; i++) man.name = legateName(man.id + '#' + i);
  man.since = s.turn;
  C.push(man);
  if (F.kind === 'player') log(s, `circle ${man.id}`, null, how === null ? null : `${man.name} joins your circle${how ? ' ' + how : ''}.`);
  return man;
}

export function removeMember(s, F, id, why) {
  const m = memberById(F, id);
  if (!m) return;
  F.circle = F.circle.filter((x) => x.id !== id);
  for (const P of Object.values(s.prov)) if (P.governor?.cid === id) P.governor = null;
  for (const A of Object.values(s.armies)) if (A.general === id) A.general = null;
  if (F.kind === 'player' && why) log(s, `circle out ${id}`, null, why);
}

// Men in your provinces who would serve you (three per province, one may be a
// friend from your past). They join your circle when you take them on.
export function localMen(s, pid) {
  const P = s.prov[pid];
  const F = s.factions[P.owner];
  const seed = `${pid}|${P.ownedSince ?? 0}|${s.seed}`;
  const out = [0, 1, 2].map((i) => makeMan(`${seed}#${i}`, { origin: 'local' }));
  if (F && F.kind === 'player' && (F.friends || []).length) {
    const fr = F.friends[hash(pid) % F.friends.length];
    out[2] = makeMan(`friend|${fr}|${s.seed}`, { origin: 'friend', friend: fr, trait: fr === 'banker' ? 'greedy' : fr === 'senator' ? 'honest' : 'able', loyalty: 75 });
  }
  const taken = new Set(Object.values(s.factions).flatMap((x) => (x.circle || []).map((m) => m.id)));
  return out.filter((m) => !taken.has(m.id));
}

// Appoint a governor (from your circle). The province carries his trait for the engine.
export function appointGovernor(s, F, pid, id) {
  const P = s.prov[pid], m = memberById(F, id);
  if (!P || P.owner !== F.id) return { error: 'Not your province' };
  if (!m) return { error: 'Not one of your men' };
  const post = postOf(s, F, m);
  if (post && post.gen) return { error: `${m.name} commands an army: relieve him first` };
  for (const Q of Object.values(s.prov)) if (Q.governor?.cid === id) Q.governor = null; // one province at a time
  P.governor = { cid: m.id, name: m.name, trait: m.trait, friend: m.friend || null, since: s.turn };
  P.instr = P.instr || 'balance';
  return { ok: true };
}

// Take on a local man and appoint him at once (the old one-step appointment).
export function hireAndAppoint(s, F, pid, id) {
  const man = localMen(s, pid).find((m) => m.id === id);
  if (!man) return { error: 'He is no longer available' };
  if (!addMember(s, F, man, null)) return { error: `Your circle is full (${MAX_CIRCLE}): dismiss someone first` };
  return appointGovernor(s, F, pid, id);
}

export function relieve(s, F, id) {
  const m = memberById(F, id);
  if (!m) return { error: 'Not one of your men' };
  if (m.restless !== undefined && legionsUnder(s, F, m).length >= 4 && s.R.events.chance(0.3)) { rebel(s, F, m); return { ok: true, rebelled: true }; }
  for (const P of Object.values(s.prov)) if (P.governor?.cid === id) P.governor = null;
  for (const A of Object.values(s.armies)) if (A.owner === F.id && A.general === id) A.general = null;
  m.loyalty = Math.max(0, m.loyalty - 5);
  return { ok: true };
}

export function dismiss(s, F, id) {
  const m = memberById(F, id);
  if (!m) return { error: 'Not one of your men' };
  removeMember(s, F, id, `${m.name} leaves your service.`);
  return { ok: true };
}

// Monthly: how each man feels about his master and his pay.
export function circleTurn(s) {
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian' || !(F.circle || []).length) continue;
    const paid = !F.unpaid; // salaries are paid with the legions (world.js economy)
    for (const m of F.circle) {
      const target = 45 + (F.legit - 40) / 2 + (m.origin === 'friend' ? 15 : 0) + (m.kin ? 20 : 0) + (F.road === 'military' ? 10 : 0); // a soldier's officers are his own men
      m.loyalty += (target - m.loyalty) * 0.05 + (paid ? 0 : -6);
      m.loyalty = Math.max(0, Math.min(100, m.loyalty));
    }
  }
}

// Greedy governors keep a cut of what they collect.
export function skimOf(s, P, revenue) { return P.governor?.trait === 'greedy' ? revenue * 0.1 : 0; }

// ---------------------------------------------------------------- loyalty and ambition (round three)
// The men you give legions to can turn on you, as Galba, Vitellius and
// Vespasian did. Danger grows with ambition over loyalty and with the legions
// he holds. You are warned first ("restless"); then he may proclaim himself
// (before July 69) or go over to the strongest claimant (after). The same
// rules for every faction.

// the legions a man could take with him: his army, or the garrison of his province
export function legionsUnder(s, F, m) {
  const post = postOf(s, F, m);
  if (!post) return [];
  if (post.gen) return s.armies[post.gen].legions.map((id) => s.legions[id]).filter(Boolean);
  return Object.values(s.legions).filter((l) => l.owner === F.id && l.loc === post.gov && (!l.army || l.army !== F.leaderArmy));
}

export function dangerOf(s, F, m) {
  if (m.hostage) return 0;
  const gap = (m.ambition - m.loyalty) / 100;
  if (gap <= 0) return 0;
  const n = legionsUnder(s, F, m).length;
  if (!n) return 0;
  return gap * Math.min(1, n / 4) * (F.legit < 40 ? 1.5 : 1) * (F.kind === 'player' ? s.diff.rebelMult ?? 1 : s.diff.rivalRebel ?? 1) * 0.3;
}

// a general's victories make his name, and his ambition
export function fame(s, F, A, d = 3) {
  const m = A && A.general && memberById(F, A.general);
  if (m) m.ambition = Math.min(100, m.ambition + d);
}

export const GIFT_COST = 50;
export const MAX_KIN = 2;
export function honour(s, F, id, kind) {
  const m = memberById(F, id);
  if (!m) return { error: 'Not one of your men' };
  if (kind === 'gift') {
    if (m.giftTurn !== undefined && s.turn - m.giftTurn < 3) return { error: 'He had a gift lately: more would look like fear' };
    if (F.treasury < GIFT_COST) return { error: 'Not enough money' };
    money(s, F, -GIFT_COST, 'gift to ' + m.name);
    m.giftTurn = s.turn; m.loyalty = Math.min(100, m.loyalty + 10);
    return { ok: true };
  }
  if (kind === 'marry') {
    if (m.kin) return { error: 'He is already family' };
    if ((F.circle || []).filter((x) => x.kin).length >= MAX_KIN) return { error: `You have no more daughters or nieces to marry (${MAX_KIN})` };
    m.kin = true; m.loyalty = Math.min(100, m.loyalty + 15); m.ambition = Math.max(0, m.ambition - 10);
    return { ok: true };
  }
  if (kind === 'hostage') {
    if (m.hostage) return { error: 'His son is already at your court' };
    m.hostage = true; m.loyalty = Math.max(0, m.loyalty - 5);
    return { ok: true };
  }
  return { error: 'Unknown honour' };
}

// He goes: with his legions, and his province if he governs one.
export function rebel(s, F, m) {
  const legs = legionsUnder(s, F, m);
  if (!legs.length) return false;
  const post = postOf(s, F, m);
  const loc = post.gen ? s.armies[post.gen].loc : post.gov;
  removeMember(s, F, m.id, null);
  let to;
  if (!s.actIVOpen && s.turn < CONFIG.actIVTurn) {
    to = newFaction(s, { kind: 'proc', road: m.style === 'impetuous' ? 'military' : m.trait === 'greedy' ? 'wealth' : 'politics', acclaimed: true, rebel: true, base: loc, legit: 12, treasury: 120, name: m.name, stats: { virtus: m.command, auct: m.admin, opes: 2, gratia: 2 } });
    s.stats.procSpawned++;
  } else {
    to = Object.values(s.factions).filter((x) => x.alive && x.kind === 'hist' && x.id !== F.id).sort((a, b) => strengthOf(s, b.id) - strengthOf(s, a.id))[0];
    if (!to) return false;
  }
  for (const l of legs) takeLegion(s, l, to.id, 60);
  const A = makeArmy(s, to.id, loc, legs.map((l) => l.id));
  if (!to.leaderArmy || !s.armies[to.leaderArmy]) to.leaderArmy = A.id;
  if (post.gov && s.prov[post.gov].owner === F.id) flipProvince(s, s.prov[post.gov], to.id, true);
  if (F.kind === 'player') s.stats.rebellions = (s.stats.rebellions || 0) + 1;
  s.stats.rebellionsAll = (s.stats.rebellionsAll || 0) + 1;
  log(s, `rebel ${m.id} from ${F.id} to ${to.id}`, loc, F.kind === 'player'
    ? (to.kind === 'proc' ? `${m.name} has proclaimed himself at ${PROV[loc].name}. ${legs.length} of your legions go with him.` : `${m.name} has gone over to ${to.name} with ${legs.length} of your legions.`)
    : (to.kind === 'proc' ? `${m.name}, who served ${F.name}, proclaims himself at ${PROV[loc].name}.` : `${m.name} leaves ${F.name} for ${to.name}, with ${legs.length} legion${legs.length === 1 ? '' : 's'}.`));
  return true;
}

// Monthly, after pay: loyalty moves; restless men are noticed; some act.
export function ambitionTurn(s) {
  const r = s.R.events;
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian' || !(F.circle || []).length) continue;
    const seat = F.leaderArmy && s.armies[F.leaderArmy] ? s.armies[F.leaderArmy].loc : F.base;
    for (const m of [...F.circle]) {
      // far from his master's eye, a man forgets whom he serves
      const post = postOf(s, F, m);
      const where = post ? (post.gen ? s.armies[post.gen].loc : post.gov) : seat;
      if (seat && where && distance(where, seat) > 3) m.loyalty = Math.max(0, m.loyalty - 0.5);
      const d = dangerOf(s, F, m);
      if (d >= 0.015 && m.restless === undefined) {
        m.restless = s.turn;
        if (F.kind === 'player') log(s, `restless ${m.id}`, where, `${m.name}'s letters are growing shorter. Men say he has been asked what he thinks of the purple.`);
        // a rival (or the bot) answers with a gift when it can
        if (!(F.kind === 'player' && s.opts.human) && F.treasury > GIFT_COST * 3) honour(s, F, m.id, 'gift');
      } else if (d < 0.01 && m.restless !== undefined) m.restless = undefined;
      if (m.restless !== undefined && s.turn > m.restless && r.chance(d)) rebel(s, F, m);
    }
  }
}
