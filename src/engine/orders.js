// Generals' standing orders (docs/DESIGN.md §19). An army under one of your
// generals carries out its order each month, and settles its own small fights
// by its general's style. You are asked only before a pitched battle bigger
// than you set (F.askAbove men, both sides together).
import { CONFIG } from './config.js';
import { PROV, distance, isWinter } from './graph.js';
import { armyPower, bodyMen, bodyPower, fallBack, hostile, legionName, negotiateChance, setDest } from './core.js';
import { doBypass, doNegotiate, fight, markNegotiation } from './combat.js';
import { pickExpansion } from './ai.js';
import { memberById } from './circle.js';

export const ARMY_ORDERS = {
  manual: { name: 'Manual', does: 'Goes where you send him; asks you at every encounter' },
  hold: { name: 'Hold', does: 'Stays in his province and throws out whoever comes' },
  guard: { name: 'Guard the frontier', does: 'Goes to your most threatened frontier and keeps it' },
  expand: { name: 'Expand', does: 'Takes weak neighbouring provinces, towns and garrisons' },
  hunt: { name: 'Hunt', does: 'Attacks enemy armies near him that are weaker than his' },
  support: { name: 'Support you', does: 'Follows your army and fights beside it' },
};
export const ASK_ABOVE = [10000, 18000, 30000, 1e9]; // 1e9: never ask (it must survive a save as JSON)
// the odds each style needs before he will attack
export const NEED = { impetuous: 1.05, cunning: 1.2, methodical: 1.3, cautious: 1.6 };

export const commanded = (s, F, A) => F.kind === 'player' && s.opts.human && A.general && A.id !== F.leaderArmy && !A.column && (A.orders || 'manual') !== 'manual';
const say = (s, line) => { (s.genLog = s.genLog && s.genLog.t === s.turn ? s.genLog : { t: s.turn, lines: [] }).lines.push(line); };
const nameOf = (s, F, A) => memberById(F, A.general)?.name || 'Your general';

// Should he ask you first? Only for a pitched battle above your threshold.
export function asksFirst(s, F, A, b) {
  if (b.kind !== 'army') return false;
  const men = A.legions.reduce((a, id) => a + s.legions[id].men, 0) + bodyMen(s, b);
  return men >= (F.askAbove ?? CONFIG.largeBattleMen);
}

// He settles an encounter himself: talk if it may work, fight at his odds, else go round or back off.
export function generalResolve(s, F, A, b, ctx) {
  const g = memberById(F, A.general);
  const need = NEED[g?.style] || 1.3;
  const ratio = armyPower(s, A) / Math.max(1, bodyPower(s, b));
  const who = nameOf(s, F, A);
  const where = PROV[A.loc].name;
  if (b.kind !== 'raid' && b.kind !== 'army') {
    const { p } = negotiateChance(s, F, b, ratio);
    if (p >= 0.45) { markNegotiation(s, F, b); const r = doNegotiate(s, F, A, b, ctx); if (r !== 'refused') { say(s, `${who} talks the ${b.kind === 'town' ? 'town' : 'garrison'} of ${where} round`); return r; } }
  }
  if (ratio >= need || b.kind === 'raid') {
    const r = fight(s, F, A, b, ctx);
    say(s, `${who} ${r === 'cleared' ? 'wins a fight' : r === 'battle' ? 'gives battle' : 'is beaten'} in ${where}`);
    return r;
  }
  if (!ctx.destination && b.kind !== 'army' && b.kind !== 'raid') { say(s, `${who} marches past ${where}`); return doBypass(s, F, A, b); }
  say(s, `${who} will not attack in ${where}: the odds are not good enough for him`);
  return 'blocked';
}

// Attacked: he decides whether to stand.
export function generalDefends(s, F, A, E) {
  const g = memberById(F, A.general);
  const ratio = armyPower(s, A) / Math.max(1, armyPower(s, E));
  // a defender holds at lower odds than he would attack at
  if (ratio >= (NEED[g?.style] || 1.3) * 0.75) return 'fight';
  fallBack(s, A, CONFIG.rearguardLoss);
  say(s, `${nameOf(s, F, A)} falls back before ${s.factions[E.owner].name} rather than fight at those odds`);
  return 'withdrew';
}

// Monthly, before the armies move: each general picks where to go by his order.
export function generalsOrders(s) {
  const F = s.factions.player;
  if (!F || !F.alive || !s.opts.human) return;
  const lead = F.leaderArmy && s.armies[F.leaderArmy];
  for (const A of Object.values(s.armies)) {
    if (A.owner !== F.id || !commanded(s, F, A) || s.pending.some((p) => p.army === A.id)) continue;
    const o = A.orders;
    if (o === 'hold') { if (A.home && A.loc !== A.home) setDest(s, A, A.home); else { A.dest = null; A.path = []; } continue; }
    if (o === 'support') { if (lead && lead.loc !== A.loc) setDest(s, A, lead.loc); else if (lead) { A.dest = null; A.path = []; } continue; }
    if (o === 'guard') {
      let best = null, bt = -1;
      for (const P of Object.values(s.prov)) if (P.owner === F.id && PROV[P.id].frontier && s.threat[PROV[P.id].frontier] > bt) { bt = s.threat[PROV[P.id].frontier]; best = P.id; }
      if (best && best !== A.loc && A.dest !== best) { setDest(s, A, best); say(s, `${nameOf(s, F, A)} marches to guard the frontier in ${PROV[best].name}`); }
      continue;
    }
    if (o === 'hunt') {
      const me = armyPower(s, A), need = NEED[memberById(F, A.general)?.style] || 1.3;
      const prey = Object.values(s.armies).filter((E) => E.legions.length && hostile(s, F.id, E.owner) && distance(A.loc, E.loc, isWinter(s.turn)) <= 2 && me >= armyPower(s, E) * need)
        .sort((a, b) => distance(A.loc, a.loc) - distance(A.loc, b.loc))[0];
      if (prey && A.dest !== prey.loc) { setDest(s, A, prey.loc); say(s, `${nameOf(s, F, A)} goes after ${s.factions[prey.owner].name}'s army in ${PROV[prey.loc].name}`); }
      else if (!prey && A.home && A.loc !== A.home && !A.path.length) setDest(s, A, A.home);
      continue;
    }
    if (o === 'expand') {
      if (A.dest && A.dest !== A.loc && A.path.length && s.prov[A.dest].owner !== F.id) continue;
      const t = pickExpansion(s, F, A);
      if (t && t !== A.loc) {
        // he does not strip a threatened frontier: the weakest legion stays behind to hold it
        const fr = PROV[A.loc].frontier, P = s.prov[A.loc];
        const others = Object.values(s.legions).some((l) => l.loc === A.loc && l.owner === F.id && l.army !== A.id);
        if (fr && s.threat[fr] > 55 && P.owner === F.id && !others && A.legions.length > 1) {
          const l = A.legions.map((id) => s.legions[id]).sort((a, b) => a.men - b.men)[0];
          A.legions = A.legions.filter((x) => x !== l.id); l.army = null; l.garrison = true;
          say(s, `${nameOf(s, F, A)} leaves ${legionName(l)} to hold the frontier in ${PROV[A.loc].name}`);
        }
        setDest(s, A, t); say(s, `${nameOf(s, F, A)} marches on ${PROV[t].name}`);
      }
    }
  }
}

// Supporting armies in the same province fight beside yours in a pitched battle.
export function supportersOf(s, F, A) {
  if (!F || F.kind !== 'player' || A.id !== F.leaderArmy) return [];
  return Object.values(s.armies).filter((X) => X.owner === F.id && X.id !== A.id && X.loc === A.loc && X.orders === 'support' && X.legions.length);
}

