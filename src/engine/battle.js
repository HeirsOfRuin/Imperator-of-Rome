// The field: large battles (docs/FRAME-BATTLE.md). ONE resolver for hand play,
// "leave it to the legates", the AI's own battles and measurement.
// State is plain data inside s.battle, so a battle survives a save.
//
// Positions 0 1 2 run west to east. The attacker stands south (bottom of the
// screen), the defender north; sector k of one faces sector k of the other.
import { streamFor } from './rng.js';

export const ORDERS = ['hold', 'advance', 'pila', 'charge', 'relieve', 'fallback'];
export const ROUNDS_DAY = 6, ROUNDS_MAX = 8;

// Damage dealt when lines are in contact: DEALT[mine][theirs] multiplies the
// damage MY line does. Each order beats one or two and loses to others; chance
// moves the numbers (about ±15%), never the ordering.
const DEALT = {
  hold:     { hold: 0.7, advance: 1.0, charge: 1.3, relieve: 0.8, fallback: 0.6 },
  advance:  { hold: 0.9, advance: 1.0, charge: 0.9, relieve: 1.2, fallback: 1.3 },
  charge:   { hold: 0.75, advance: 1.25, charge: 1.2, relieve: 1.7, fallback: 0.7 },
  relieve:  { hold: 0.6, advance: 0.6, charge: 0.5, relieve: 0.6, fallback: 0.6 },
  fallback: { hold: 0.4, advance: 0.4, charge: 0.5, relieve: 0.4, fallback: 0.3 },
};
const asContact = (o) => (o === 'pila' ? 'hold' : o); // a volley is impossible in contact: the line holds
export const DAMAGE = 0.2;
export const FRONTAGE = 6;
export const MORALE_PER_LOSS = 180;
const ENDURANCE = { hold: -12, advance: -18, pila: -6, charge: -34, relieve: -4, fallback: -10 };
const VOLLEY_TARGET = { advance: 1.5, charge: 1.2, hold: 1.1, pila: 1.0, relieve: 1.3, fallback: 0.5 };
export const GENERALS = ['impetuous', 'methodical', 'cunning', 'cautious'];
// 'legates' is the player's auto-resolve: steady, unimaginative, never clever

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------- setup

// sideSpec: { fid, armyId, legions: [{ id, men, exp, loyalty, group, client }], virtus, gratia, general, cavalryMult, edge }
export function setupBattle({ id, loc, seed, turn, att, def, player, site }) {
  const b = { id, loc, seed, turn, site: site || 'plain', round: 0, night: false, over: false, winner: null, player: player || null, log: [], dusk: false, appealed: {} };
  b.sides = { att: makeSide(att), def: makeSide(def) };
  return b;
}

function makeSide(spec) {
  const cohorts = [];
  for (const l of spec.legions) {
    const per = Math.max(60, Math.round(l.men / 10));
    for (let n = 1; n <= 10; n++) {
      cohorts.push({
        id: `${l.id}#${n}`, legion: l.id, n, men: per, max: per,
        morale: clamp(48 + l.loyalty * 0.35 + l.exp * 12, 30, 95), end: 100,
        pila: l.client ? 3 : 2, exp: l.exp, state: 'fresh', line: n <= 4 ? 0 : n <= 7 ? 1 : 2,
      });
    }
  }
  // lines into sectors: each line's cohorts split 30/40/30 west-centre-east, legion by legion
  const sectors = [0, 1, 2].map(() => ({ lines: [[], [], []], broken: [], front: 0, reliefs: 2, dist: 2, order: 'advance', routed: false, flanked: 0, history: [] }));
  const reserve = [];
  for (let line = 0; line < 3; line++) {
    const row = cohorts.filter((c) => c.line === line);
    if (line === 2) {
      // one cohort per legion held back as the reserve (at most six)
      const seen = new Set();
      for (const c of row) if (!seen.has(c.legion) && reserve.length < 6) { seen.add(c.legion); reserve.push(c.id); c.state = 'reserve'; }
    }
    const placeable = row.filter((c) => c.state !== 'reserve');
    const cut1 = Math.round(placeable.length * 0.3), cut2 = Math.round(placeable.length * 0.7);
    placeable.forEach((c, i) => { const k = i < cut1 ? 0 : i < cut2 ? 1 : 2; c.sector = k; sectors[k].lines[line].push(c.id); });
  }
  for (const c of cohorts) if (c.state === 'reserve') c.sector = null;
  // frontage: a sector's front holds at most FRONTAGE cohorts; the rest form
  // more lines behind (a bigger army gets depth, not a wider wall)
  for (const S of sectors) {
    const all = S.lines.flat();
    S.lines = [];
    for (let i = 0; i < all.length; i += FRONTAGE) S.lines.push(all.slice(i, i + FRONTAGE));
  }
  const cav = Math.round(240 * spec.legions.length * (spec.cavalryMult || 1));
  return {
    fid: spec.fid, armyId: spec.armyId, general: spec.general || 'methodical', virtus: spec.virtus || 2, gratia: spec.gratia || 2, comrades: spec.comrades || null, edge: spec.edge || 1,
    cohorts: Object.fromEntries(cohorts.map((c) => [c.id, c])), sectors, reserve, reserveUsed: false,
    cav: [0, 2].map((pos) => ({ pos, men: cav, max: cav, end: 100, order: 'screen', beaten: 0 })),
    legate: { action: 'stay', target: 1 }, ruse: null, ruseUsed: false, rallyUsed: false, dead: false,
    loyalty: Object.fromEntries(spec.legions.map((l) => [l.id, l.loyalty])), groups: Object.fromEntries(spec.legions.map((l) => [l.id, l.group])),
  };
}

// ---------------------------------------------------------------- reading

export const frontOf = (side, k) => {
  const S = side.sectors[k];
  if (!S || S.routed) return [];
  return (S.lines[S.front] || []).map((id) => side.cohorts[id]).filter((c) => c.men > 0 && c.state !== 'routed' && c.state !== 'gone');
};
const avg = (xs, f) => (xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : 0);
export function sectorState(side, k) {
  const f = frontOf(side, k);
  return { men: f.reduce((a, c) => a + c.men, 0), morale: avg(f, (c) => c.morale), end: avg(f, (c) => c.end), pila: avg(f, (c) => c.pila), routed: side.sectors[k].routed, linesLeft: side.sectors[k].lines.length - side.sectors[k].front - 1 };
}
function power(side, cs) {
  return cs.reduce((a, c) => a + c.men * c.exp * (0.55 + 0.45 * c.morale / 100) * (0.4 + 0.6 * c.end / 100) * (c.end < 30 ? 0.65 : 1), 0) * (1 + 0.04 * side.virtus) * side.edge;
}

// What an order needs; '' when it can be given.
export function orderBlocked(side, k, o) {
  const S = side.sectors[k];
  if (S.routed) return 'This sector has broken';
  if (o === 'pila') { if (S.dist !== 1) return S.dist === 0 ? 'Too close: the lines are locked' : 'Out of range'; if (sectorState(side, k).pila < 0.5) return 'No pila left'; }
  if (o === 'relieve') { if (S.reliefs <= 0) return 'No reliefs left'; if (S.lines.length - S.front < 2) return 'No line behind to take over'; }
  if (o === 'charge' && S.dist === 2) return 'Too far to charge';
  return '';
}

// ---------------------------------------------------------------- AI generals (and auto-resolve)

function counterTo(o, dist) {
  if (o === 'charge') return 'hold';
  if (o === 'relieve') return 'charge';
  if (o === 'hold') return dist === 1 ? 'pila' : 'advance';
  if (o === 'advance') return dist === 1 ? 'pila' : 'hold';
  if (o === 'fallback') return 'advance';
  return 'hold';
}

export function aiOrders(b, sideKey, r, style) {
  const me = b.sides[sideKey], them = b.sides[sideKey === 'att' ? 'def' : 'att'];
  const g = style || me.general;
  for (let k = 0; k < 3; k++) {
    const S = me.sectors[k];
    if (S.routed) continue;
    const mine = sectorState(me, k), theirs = sectorState(them, k);
    const enemyHist = them.sectors[k].history;
    let o;
    if (S.dist === 2) o = g === 'cautious' && b.round < 2 ? 'hold' : 'advance';
    else if (S.dist === 1) {
      if (g === 'impetuous') o = mine.pila >= 1 && r.chance(0.4) ? 'pila' : r.chance(0.5) ? 'charge' : 'advance';
      else o = mine.pila >= 0.5 ? 'pila' : g === 'cautious' ? 'hold' : 'advance';
    } else {
      const canRelieve = !orderBlocked(me, k, 'relieve');
      const relieveAt = { impetuous: 25, methodical: 42, cunning: 40, cautious: 50, legates: 28 }[g];
      if (mine.end < relieveAt && canRelieve) o = 'relieve';
      else if (g === 'impetuous') o = mine.end > 40 ? 'charge' : 'hold';
      else if (g === 'cautious') o = mine.morale < 35 ? 'fallback' : 'hold';
      else if (g === 'legates') o = theirs.morale < 28 ? 'charge' : 'hold';
      else if (theirs.end < 42 || theirs.morale < 35) o = 'charge';
      else o = mine.end > 70 && g === 'cunning' && r.chance(0.3) ? 'charge' : 'hold';
      if (g === 'cunning' && !me.ruseUsed && them.general !== 'cautious' && mine.morale > 50 && k === 1 && b.round >= 2 && r.chance(0.35)) { me.ruse = { sector: k, round: b.round + 1 }; me.ruseUsed = true; }
      if (me.ruse && me.ruse.sector === k && me.ruse.round === b.round) o = 'fallback';
    }
    // he answers repetition
    const last2 = enemyHist.slice(-2);
    if (last2.length === 2 && last2[0] === last2[1] && g !== 'impetuous' && g !== 'legates' && r.chance(0.6)) {
      const c = counterTo(last2[0], S.dist);
      if (!orderBlocked(me, k, c)) o = c;
    }
    if (orderBlocked(me, k, o)) o = S.dist === 0 ? 'hold' : 'advance';
    S.order = o;
  }
  // reserve: to the weakest sector once it wavers
  if (!me.reserveUsed && me.reserve.length) {
    let worst = null, wm = 101;
    for (let k = 0; k < 3; k++) { const st = sectorState(me, k); if (!st.routed && st.morale < wm && me.sectors[k].dist === 0) { wm = st.morale; worst = k; } }
    me.reserveOrder = worst !== null && wm < 45 ? worst : null;
  }
  // cavalry
  for (const c of me.cav) {
    const enemyCav = them.cav.find((x) => x.pos === c.pos);
    const k = c.pos;
    if (them.sectors[k].routed && (g === 'impetuous' || g === 'cunning')) c.order = 'pursue';
    else if (c.end > 50 && (enemyCav.beaten || enemyCav.men < 1 || c.men > enemyCav.men * (g === 'cunning' ? 1.1 : 1.4)) && b.round >= 2) c.order = 'charge';
    else c.order = 'screen';
  }
  // the general rides to the weakest sector in contact
  let worst = 1, wm = 101;
  for (let k = 0; k < 3; k++) { const st = sectorState(me, k); if (!st.routed && me.sectors[k].dist === 0 && st.morale < wm) { wm = st.morale; worst = k; } }
  me.legate = wm < 55 ? { action: 'ride', target: worst } : { action: 'stay', target: 1 };
  if (me.sectors.some((S) => S.routed) && !me.rallyUsed) me.legate = { action: 'rally', target: me.sectors.findIndex((S) => S.routed) };
}

// ---------------------------------------------------------------- one round

function hurt(side, cs, men, moraleHit) {
  const tot = cs.reduce((a, c) => a + c.men, 0);
  if (!tot) return 0;
  let lost = 0;
  for (const c of cs) {
    const d = Math.min(c.men, Math.round(men * c.men / tot));
    c.men -= d; lost += d;
    c.morale = clamp(c.morale - moraleHit - (d / Math.max(1, c.max)) * MORALE_PER_LOSS, 0, 100);
    if (c.state === 'fresh') c.state = 'engaged';
  }
  return lost;
}

function say(b, text) { b.log.push({ round: b.round, text }); }
const SECT = ['the left', 'the centre', 'the right'];
function sectorName(b, sideKey, k) {
  // name sectors from the player's point of view
  if (b.player === 'def' || (sideKey === 'def' && b.player !== 'att')) return SECT[2 - k];
  return SECT[k];
}

export function resolveRound(b) {
  if (b.over) return b;
  const r = streamFor(b.seed, b.turn * 100 + b.round, 'field' + b.id);
  const A = b.sides.att, D = b.sides.def;
  const night = b.round >= ROUNDS_DAY;
  const v = night ? 0.3 : 0.15;
  b.lastEvents = [];
  const ev = (e) => b.lastEvents.push(e);

  for (const [me, them, key] of [[A, D, 'att'], [D, A, 'def']]) {
    // reserve
    const ro = me.reserveOrder;
    if (ro !== null && ro !== undefined && !me.reserveUsed && me.reserve.length && !me.sectors[ro].routed) {
      const S = me.sectors[ro];
      for (const id of me.reserve) { me.cohorts[id].sector = ro; me.cohorts[id].state = 'fresh'; }
      S.lines.splice(S.front + 1, 0, [...me.reserve]);
      me.reserve = []; me.reserveUsed = true;
      for (const c of frontOf(me, ro)) c.morale = clamp(c.morale + 8, 0, 100);
      ev({ kind: 'reserve', side: key, sector: ro });
      if (b.player === key) say(b, `Your reserve marches up behind ${sectorName(b, key, ro)}.`);
    }
    me.reserveOrder = null;
    // legate
    const L = me.legate;
    if (L.action === 'ride' && !me.sectors[L.target].routed) {
      for (const c of frontOf(me, L.target)) c.morale = clamp(c.morale + 12, 0, 100);
      const danger = 0.01 + (me.sectors[L.target].dist === 0 && them.sectors[L.target].order === 'charge' ? 0.02 : 0);
      if (r.chance(danger)) { me.dead = true; for (const c of Object.values(me.cohorts)) c.morale = clamp(c.morale - 25, 0, 100); say(b, b.player === key ? 'You are struck down at the head of your men.' : 'Their general falls. A groan runs down their line.'); }
      else if (b.player === key) say(b, `You ride to ${sectorName(b, key, L.target)}; the men cheer.`);
    } else if (L.action === 'rally' && !me.rallyUsed && me.sectors[L.target].routed) {
      const S = me.sectors[L.target];
      const back = S.broken.map((id) => me.cohorts[id]).filter((c) => c.men > 50);
      if (back.length) {
        S.routed = false; S.lines.push(back.map((c) => c.id)); S.front = S.lines.length - 1; S.broken = [];
        for (const c of back) { c.state = 'engaged'; c.morale = 35; }
        me.rallyUsed = true;
        if (b.player === key) say(b, `You rally ${sectorName(b, key, L.target)} under the eagle.`);
      }
    } else if (L.action === 'appeal') {
      const k = L.target;
      const f = frontOf(them, k);
      const legs = [...new Set(f.map((c) => c.legion))].filter((lid) => !b.appealed[lid]);
      const tgt = legs.map((lid) => ({ lid, loy: them.loyalty?.[lid] ?? 60, group: them.groups?.[lid] })).sort((a, c) => a.loy - c.loy)[0];
      if (tgt) {
        b.appealed[tgt.lid] = true;
        const p = clamp(0.04 * me.gratia + (me.comrades && tgt.group === me.comrades ? 0.15 : 0) + (night ? 0.12 : 0) - (tgt.loy - 45) / 100, 0.02, 0.6);
        if (r.chance(p)) {
          const coh = Object.values(them.cohorts).filter((c) => c.legion === tgt.lid && c.men > 0 && c.state !== 'routed');
          const join = r.chance(0.5);
          for (const c of coh) {
            if (join) { const nc = { ...c, id: c.id + '*', state: 'fresh', morale: 60, sector: k }; me.cohorts[nc.id] = nc; const S = me.sectors[k]; (S.lines[S.lines.length - 1] || (S.lines[0] = [])).push(nc.id); }
            if (!join) (b.leftField = b.leftField || []).push({ side: key === 'att' ? 'def' : 'att', legion: c.legion, men: c.men });
            c.state = 'gone'; c.men = 0;
          }
          ev({ kind: 'appeal', side: key, legion: tgt.lid, join });
          say(b, `${key === b.player ? 'Your appeal is heard' : 'Men call across the lines'}: ${tgt.lid.replace('-', ' ')} ${join ? 'turns its standards and joins ' + (key === b.player ? 'you' : 'them') : 'lowers its standards and leaves the field'}.`);
        } else if (b.player === key) say(b, `You call across the lines to ${tgt.lid.replace('-', ' ')}. Nobody answers.`);
      }
    } else if (L.action === 'ruse' && !me.ruseUsed) {
      me.ruse = { sector: L.target, round: b.round + 1 }; me.ruseUsed = true;
      if (b.player === key) say(b, `The signal is set: next round ${sectorName(b, key, L.target)} will feign a retreat.`);
    }
  }

  // per sector: missiles, closing, melee
  const startDist = A.sectors.map((S) => S.dist);
  for (let k = 0; k < 3; k++) {
    const SA = A.sectors[k], SD = D.sectors[k];
    if (SA.routed || SD.routed) continue;
    const oA = SA.order, oD = SD.order;
    SA.history.push(oA); SD.history.push(oD);
    const d0 = startDist[k];
    // volleys at near range
    for (const [me, them, Sme, o, oThem, key] of [[A, D, SA, oA, oD, 'att'], [D, A, SD, oD, oA, 'def']]) {
      if (o !== 'pila' || d0 !== 1) continue;
      const f = frontOf(me, k).filter((c) => c.pila > 0);
      const men = f.reduce((a, c) => a + c.men, 0);
      f.forEach((c) => { c.pila--; c.end = clamp(c.end + ENDURANCE.pila, 0, 100); });
      const dmg = men * 0.05 * VOLLEY_TARGET[oThem] * r.float(1 - v, 1 + v);
      const lost = hurt(them, frontOf(them, k), dmg, 6);
      for (const c of frontOf(them, k)) c.shaken = b.round;
      ev({ kind: 'volley', side: key, sector: k, lost });
      if (b.player === key) say(b, `${cap(sectorName(b, key, k))}: your pila fall on them${VOLLEY_TARGET[oThem] > 1.2 ? ' as they come on' : ''}. About ${lost} men down.`);
      else if (b.player) say(b, `${cap(sectorName(b, b.player, k))}: their volley strikes your line. About ${lost} men down.`);
    }
    // movement
    const closes = (o) => (o === 'advance' || o === 'charge' ? 1 : 0);
    let d = d0;
    const fallA = oA === 'fallback', fallD = oD === 'fallback';
    if (d > 0 && (closes(oA) || closes(oD))) {
      d -= 1; // lines close one band a round: far, then volley range, then contact
      if ((oA === 'charge' || oD === 'charge') && d0 === 1) d = 0;
      d = Math.max(0, d);
    }
    if ((fallA && !closes(oD)) || (fallD && !closes(oA))) d = Math.min(2, d + 1);
    SA.dist = SD.dist = d;
    // endurance
    for (const [me, o, other] of [[A, oA, oD], [D, oD, oA]]) for (const c of frontOf(me, k)) {
      const pressed = d === 0 && (other === 'advance' || other === 'charge') ? -10 : 0; // holding off a pushing line is tiring work
      c.end = clamp(c.end + (d === 0 || o === 'charge' || o === 'advance' ? ENDURANCE[o] + pressed : 10), 0, 100);
    }
    // melee
    if (d === 0) {
      const fA = frontOf(A, k), fD = frontOf(D, k);
      let dealtA = DEALT[asContact(oA)][asContact(oD)], dealtD = DEALT[asContact(oD)][asContact(oA)];
      // a spent line cannot brace: against it, a charge goes home
      const endA = avg(fA, (c) => c.end), endD = avg(fD, (c) => c.end);
      if (oA === 'charge' && asContact(oD) === 'hold' && endD < 40) { dealtA = 1.35; dealtD = 0.8; }
      if (oD === 'charge' && asContact(oA) === 'hold' && endA < 40) { dealtD = 1.35; dealtA = 0.8; }
      // a charge into a line your volley has just shaken
      if (oA === 'charge' && fD.some((c) => c.shaken >= b.round - 1)) dealtA *= 1.3;
      if (oD === 'charge' && fA.some((c) => c.shaken >= b.round - 1)) dealtD *= 1.3;
      // ruse: a feigned retreat into their pursuit
      for (const [me, Sme, o, other, isA] of [[A, SA, oA, oD, true], [D, SD, oD, oA, false]]) {
        if (me.ruse && me.ruse.sector === k && me.ruse.round === b.round && o === 'fallback' && (other === 'charge' || other === 'advance')) {
          if (isA) dealtA = 1.6; else dealtD = 1.6;
          for (const c of (isA ? fD : fA)) c.morale = clamp(c.morale - 15, 0, 100);
          say(b, `${cap(sectorName(b, isA ? 'att' : 'def', k))}: the retreat was a ruse; the pursuers are caught between the lines.`);
          ev({ kind: 'ruse', side: isA ? 'att' : 'def', sector: k });
        }
      }
      const pA = power(A, fA) * (1 + 0.3 * (SD.flanked > 0)), pD = power(D, fD) * (1 + 0.3 * (SA.flanked > 0));
      const lossD = hurt(D, fD, pA * DAMAGE * dealtA * r.float(1 - v, 1 + v), oA === 'charge' && oD !== 'hold' ? 5 : 0);
      const lossA = hurt(A, fA, pD * DAMAGE * dealtD * r.float(1 - v, 1 + v), oD === 'charge' && oA !== 'hold' ? 5 : 0);
      if (oA === 'charge' && (oD === 'hold' || oD === 'pila')) for (const c of fA) c.morale = clamp(c.morale - 5, 0, 100);
      if (oD === 'charge' && (oA === 'hold' || oA === 'pila')) for (const c of fD) c.morale = clamp(c.morale - 5, 0, 100);
      ev({ kind: 'melee', sector: k, lossA, lossD, oA, oD });
      if (b.player) {
        const [mine, theirs, om, ot] = b.player === 'att' ? [lossA, lossD, oA, oD] : [lossD, lossA, oD, oA];
        say(b, `${cap(sectorName(b, b.player, k))}: ${meleeLine(om, ot)} You lose about ${mine}; they lose about ${theirs}.`);
      }
    }
    // relief after the fighting
    for (const [me, Sme, o, key] of [[A, SA, oA, 'att'], [D, SD, oD, 'def']]) {
      if (o !== 'relieve' || orderBlocked(me, k, 'relieve')) continue;
      // the Roman rotation: the tired line passes back through the gaps to rest
      const tired = Sme.lines.splice(Sme.front, 1)[0];
      Sme.lines.push(tired);
      for (const id of tired) { const c = me.cohorts[id]; if (c.state !== 'routed') c.state = 'tired'; }
      Sme.reliefs--;
      if (b.player === key) say(b, `${cap(sectorName(b, key, k))}: fresh cohorts pass through the gaps and take the front.`);
      ev({ kind: 'relief', side: key, sector: k });
    }
  }

  // cavalry on the wings
  for (const pos of [0, 2]) {
    const ca = A.cav.find((c) => c.pos === pos), cd = D.cav.find((c) => c.pos === pos);
    for (const c of [ca, cd]) if (c.beaten > 0) c.beaten--;
    for (const [mine, theirs, me, them, key] of [[ca, cd, A, D, 'att'], [cd, ca, D, A, 'def']]) {
      if (mine.men < 50 || mine.end < 30) continue;
      if (mine.order === 'pursue' && them.sectors[pos].routed) {
        const fleeing = [...them.sectors[pos].lines.flat(), ...them.sectors[pos].broken].map((id) => them.cohorts[id]).filter((c) => c.men > 0);
        const kill = fleeing.reduce((a, c) => { const x = Math.round(c.men * 0.25); c.men -= x; return a + x; }, 0);
        mine.end -= 40;
        if (b.player === key) say(b, `Your horse rides down the fugitives: about ${kill} cut down.`);
        continue;
      }
      if (mine.order !== 'charge') continue;
      mine.end -= 30;
      const screen = theirs.order === 'screen' && theirs.beaten === 0 && theirs.men >= 50 && theirs.end >= 30;
      if (screen) {
        const pm = mine.men * (mine.end / 100 + 0.5) * (1 + 0.05 * me.virtus) * r.float(1 - v, 1 + v);
        const pt = theirs.men * (theirs.end / 100 + 0.5) * (1 + 0.05 * them.virtus) * r.float(1 - v, 1 + v) * 1.15;
        if (pm > pt) { theirs.men = Math.round(theirs.men * 0.7); theirs.beaten = 2; mine.men = Math.round(mine.men * 0.9); if (b.player) say(b, `${key === b.player ? 'Your' : 'Their'} horse on the ${pos === 0 ? 'west' : 'east'} wing drives off ${key === b.player ? 'theirs' : 'yours'}.`); }
        else { mine.men = Math.round(mine.men * 0.75); mine.beaten = 2; if (b.player) say(b, `${key === b.player ? 'Your' : 'Their'} horse charges and is thrown back.`); continue; }
      }
      // into the flank
      const f = frontOf(them, pos);
      if (f.length) {
        hurt(them, f, f.reduce((a, c) => a + c.men, 0) * 0.04, 15);
        them.sectors[pos].flanked = 2;
        ev({ kind: 'flank', side: key, sector: pos });
        if (b.player) say(b, key === b.player ? `Your horse falls on the flank of ${sectorName(b, key, pos)} of their line.` : `Their horse is in your flank on ${sectorName(b, b.player, pos)}!`);
      }
    }
    for (const c of [ca, cd]) { if (c.order === 'screen') c.end = clamp(c.end + 8, 0, 100); }
  }

  // morale: lines give way, sectors break, flanks open
  for (const [me, key] of [[A, 'att'], [D, 'def']]) {
    for (let k = 0; k < 3; k++) {
      const S = me.sectors[k];
      if (S.routed) continue;
      if (S.flanked > 0) S.flanked--;
      // rear lines rest
      S.lines.forEach((line, i) => { if (i !== S.front) for (const id of line) { const c = me.cohorts[id]; c.end = clamp(c.end + 20, 0, 100); c.morale = clamp(c.morale + 3, 0, 100); if (c.state === 'tired' && c.end > 70) c.state = 'fresh'; } });
      // spent men lose heart in the press
      if (S.dist === 0) for (const c of frontOf(me, k)) if (c.end < 30) c.morale = clamp(c.morale - 12, 0, 100);
      for (const c of frontOf(me, k)) { if (c.morale < 10) c.state = 'routed'; else if (c.morale < 25) c.state = 'wavering'; }
      const f = frontOf(me, k);
      const st = sectorState(me, k);
      if (!f.length || st.morale < 12) {
        // the line gives way: the next line steps up, or the sector breaks
        const gone = S.lines.splice(S.front, 1)[0] || [];
        for (const id of gone) { const c = me.cohorts[id]; if (c.men > 0) c.state = 'routed'; }
        S.broken.push(...gone);
        if (S.front < S.lines.length) {
          // panic spreads to the line that has to stand in its place
          for (const c of frontOf(me, k)) c.morale = clamp(c.morale - 20, 0, 100);
          if (b.player) say(b, key === b.player ? `${cap(sectorName(b, key, k))}: your front line breaks; the next line steps up.` : `${cap(sectorName(b, b.player === 'att' ? 'att' : 'def', k))}: their front line breaks.`);
        } else {
          S.routed = true;
          for (const id of [...S.lines.flat(), ...S.broken]) { const c = me.cohorts[id]; if (c.men > 0) { c.state = 'routed'; c.men = Math.round(c.men * 0.9); } }
          ev({ kind: 'rout', side: key, sector: k });
          if (b.player) say(b, key === b.player ? `${cap(sectorName(b, key, k))} breaks and runs!` : `Their line breaks on ${sectorName(b, b.player, k)}!`);
          for (const j of [k - 1, k + 1]) if (j >= 0 && j < 3 && !me.sectors[j].routed) { me.sectors[j].flanked = 3; for (const c of frontOf(me, j)) c.morale = clamp(c.morale - 15, 0, 100); }
        }
      }
    }
  }

  b.round++;
  // is an army broken? (both at once: the one with more nerve left holds the field)
  const broken = {};
  for (const [me, key] of [[A, 'att'], [D, 'def']]) {
    const routed = me.sectors.filter((S) => S.routed).length;
    // an army breaks at its fighting front, not in its fresh rear lines
    const standing = [0, 1, 2].flatMap((k) => frontOf(me, k));
    const m = avg(standing, (c) => c.morale);
    // nerve fails only once the fight has gone on, unless a sector has already run
    broken[key] = routed >= 2 || !standing.length || ((m < 25 || (me.dead && m < 40)) && (routed >= 1 || b.round >= 4)) ? m + (2 - routed) * 10 : null;
  }
  if (broken.att !== null || broken.def !== null) {
    b.over = true;
    if (broken.att !== null && broken.def !== null) b.winner = broken.att > broken.def ? 'att' : 'def';
    else b.winner = broken.att !== null ? 'def' : 'att';
  }
  if (!b.over && b.round === ROUNDS_DAY) b.dusk = true;
  if (!b.over && b.round >= ROUNDS_MAX) finishByStrength(b);
  return b;
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function meleeLine(mine, theirs) {
  if (mine === 'charge' && (theirs === 'hold' || theirs === 'pila')) return 'your charge breaks on their braced shields.';
  if (theirs === 'charge' && (mine === 'hold' || mine === 'pila')) return 'their charge breaks on your braced shields.';
  if (mine === 'charge' && theirs === 'relieve') return 'you catch them changing their lines.';
  if (theirs === 'charge' && mine === 'relieve') return 'they charge as your lines are changing.';
  if (mine === 'charge' && theirs === 'charge') return 'the lines crash together.';
  if (mine === 'fallback') return 'you give ground.';
  if (theirs === 'fallback') return 'they give ground.';
  if (mine === 'advance' || theirs === 'advance') return 'shield against shield, the line is pushed.';
  return 'the lines grind against each other.';
}

function finishByStrength(b) {
  const sc = (side) => Object.values(side.cohorts).filter((c) => c.men > 0 && c.state !== 'routed' && c.state !== 'gone').reduce((a, c) => a + c.men * (c.morale / 100), 0);
  const a = sc(b.sides.att), d = sc(b.sides.def);
  b.over = true;
  b.winner = a > d * 1.3 ? 'att' : d > a * 1.3 ? 'def' : 'draw';
}

// At dusk: fight on into the night, or break off (a draw; the attacker withdraws).
export function decideDusk(b, fightOn) {
  b.dusk = false;
  if (!fightOn) { finishByStrength(b); if (b.winner !== 'def') { /* breaking off leaves the field to whoever is ahead */ } }
}

// Play the rest of a battle with every side on policy (auto-resolve, AI, measurement).
export function autoBattle(b, policies = {}) {
  let guard = 0;
  while (!b.over && guard++ < 12) {
    const r = streamFor(b.seed, b.turn * 100 + b.round, 'policy' + b.id);
    for (const key of ['att', 'def']) {
      const p = policies[key];
      if (typeof p === 'function') p(b, key, r);
      else aiOrders(b, key, r, p);
    }
    resolveRound(b);
    if (b.dusk) {
      const ahead = strengthRatio(b);
      decideDusk(b, ahead > 1.15 || ahead < 0.87);
    }
  }
  if (!b.over) finishByStrength(b);
  return b;
}

export function strengthRatio(b) {
  const sc = (side) => Object.values(side.cohorts).filter((c) => c.men > 0 && c.state !== 'routed' && c.state !== 'gone').reduce((a, c) => a + c.men * (c.morale / 100) * (c.end / 100 + 0.5), 0);
  return sc(b.sides.att) / Math.max(1, sc(b.sides.def));
}

// Men lost per legion, for writing back to the campaign.
export function survivors(b, sideKey) {
  const side = b.sides[sideKey];
  const out = {};
  for (const c of Object.values(side.cohorts)) {
    const lid = c.id.endsWith('*') ? null : c.legion;
    if (!lid) continue;
    out[lid] = (out[lid] || 0) + Math.max(0, c.men);
  }
  return out;
}
export function defectors(b, sideKey) {
  return [...new Set(Object.values(b.sides[sideKey].cohorts).filter((c) => c.id.endsWith('*')).map((c) => c.legion))];
}
