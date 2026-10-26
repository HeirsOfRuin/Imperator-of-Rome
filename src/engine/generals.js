// Generals who have sworn to you, and the armies they command for you.
// Only the human player keeps generals: rivals march as one army with
// reinforcement columns (ai.js). A general adds to his army's strength, fights
// its battles in his own style, and can die doing it.
import { PROV } from './graph.js';
import { legateName, legionName, log, makeArmy, ownedLegions, setDest } from './core.js';

export const MAX_GENERALS = 4;
export const STYLES = ['methodical', 'cautious', 'impetuous', 'cunning'];
export const STYLE_TEXT = {
  methodical: 'Methodical: relieves his lines on time, charges a tired enemy.',
  cautious: 'Cautious: holds and waits; loses few men, wins few battles outright.',
  impetuous: 'Impetuous: charges early; wins fast or loses badly.',
  cunning: 'Cunning: feints and flank attacks.',
};

function hash(t) { let h = 0x811c9dc5; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h; }

// A man swears to you. how: a line for the dispatches. Returns the general, or
// null if your staff is full or he is already yours.
export function addGeneral(s, F, { id, name, style, skill, how }) {
  if (F.kind !== 'player' || !s.opts.human) return null;
  F.generals = F.generals || [];
  if (F.generals.length >= MAX_GENERALS) return null;
  const gid = id || `G${s.nextId++}`;
  if (F.generals.some((g) => g.id === gid)) return null;
  const h = hash(gid + s.seed);
  const g = { id: gid, name: name || legateName(gid), style: style || STYLES[h % 4], skill: skill || 1 + (h >>> 4) % 3, since: s.turn };
  F.generals.push(g);
  log(s, `general ${g.id}`, null, `${g.name} swears to you${how ? ' ' + how : ''}. He can command an army for you.`);
  return g;
}

export const generalById = (F, gid) => (F.generals || []).find((g) => g.id === gid) || null;
export const armyOfGeneral = (s, gid) => Object.values(s.armies).find((A) => A.general === gid && A.legions.length) || null;

export function generalDies(s, F, gid) {
  const g = generalById(F, gid);
  if (!g) return;
  F.generals = F.generals.filter((x) => x.id !== gid);
  for (const A of Object.values(s.armies)) if (A.general === gid) A.general = null;
  log(s, `general dies ${gid}`, null, `${g.name}, who commanded for you, is dead.`);
}

// Legions at one place, not in any army, under a general's command.
export function formArmy(s, F, pid, gid, legionIds) {
  const g = generalById(F, gid);
  if (!g) return { error: 'No such general' };
  if (armyOfGeneral(s, gid)) return { error: `${g.name} already commands an army` };
  const free = ownedLegions(s, F.id).filter((l) => l.loc === pid && !l.army);
  const ids = legionIds ? free.filter((l) => legionIds.includes(l.id)).map((l) => l.id) : free.map((l) => l.id);
  if (!ids.length) return { error: 'No free legion there: detach one from an army first' };
  for (const id of ids) s.legions[id].garrison = false;
  const A = makeArmy(s, F.id, pid, ids);
  A.general = gid;
  return { ok: true, army: A.id };
}

export function assignGeneral(s, F, armyId, gid) {
  const A = s.armies[armyId];
  if (!A || A.owner !== F.id) return { error: 'Not your army' };
  if (A.id === F.leaderArmy) return { error: 'You command this army yourself' };
  if (gid) {
    if (!generalById(F, gid)) return { error: 'No such general' };
    const other = armyOfGeneral(s, gid);
    if (other && other.id !== A.id) other.general = null;
  }
  A.general = gid || null;
  return { ok: true };
}

// Split an army: half its legions (at least one stays) go to a general, in place.
export function splitArmy(s, F, armyId, gid) {
  const A = s.armies[armyId];
  if (!A || A.owner !== F.id) return { error: 'Not your army' };
  if (A.legions.length < 2) return { error: 'One legion cannot be split' };
  if (!generalById(F, gid)) return { error: 'No such general' };
  if (armyOfGeneral(s, gid)) return { error: 'He already commands an army' };
  if (s.pending.some((p) => p.army === A.id)) return { error: 'The army is facing an enemy: decide that first' };
  const give = A.legions.slice(Math.ceil(A.legions.length / 2));
  A.legions = A.legions.filter((x) => !give.includes(x));
  for (const id of give) s.legions[id].army = null;
  const B = makeArmy(s, F.id, A.loc, give);
  B.general = gid; B.from = A.from;
  return { ok: true, army: B.id };
}

// A legion joins an army: at once if they stand together, otherwise it marches
// to join (a column that merges when it arrives).
export function joinArmy(s, F, legionId, armyId) {
  const l = s.legions[legionId], A = s.armies[armyId];
  if (!l || l.owner !== F.id) return { error: 'Not your legion' };
  if (!A || A.owner !== F.id || !A.legions.length) return { error: 'No such army' };
  if (l.army === A.id) return { error: 'Already with that army' };
  if (l.army) { const B = s.armies[l.army]; B.legions = B.legions.filter((x) => x !== l.id); l.army = null; }
  l.garrison = false;
  if (l.loc === A.loc) { l.army = A.id; A.legions.push(l.id); return { ok: true, joined: true }; }
  const C = makeArmy(s, F.id, l.loc, [l.id]);
  C.column = A.id;
  setDest(s, C, A.loc);
  return { ok: true, joined: false };
}

// Detach a legion: it stays where it stands as a garrison.
export function detach(s, F, legionId) {
  const l = s.legions[legionId];
  if (!l || l.owner !== F.id) return { error: 'Not your legion' };
  if (l.army) {
    const A = s.armies[l.army];
    if (A.id === F.leaderArmy && A.legions.length === 1) return { error: 'Your own army needs at least one legion: you march with it' };
    A.legions = A.legions.filter((x) => x !== l.id); l.army = null;
    if (!A.legions.length) delete s.armies[A.id];
  }
  l.garrison = true;
  return { ok: true };
}

export function disband(s, F, armyId) {
  const A = s.armies[armyId];
  if (!A || A.owner !== F.id) return { error: 'Not your army' };
  if (A.id === F.leaderArmy) return { error: 'You cannot disband the army you lead' };
  for (const id of A.legions) { const l = s.legions[id]; if (l) { l.army = null; l.garrison = true; } }
  delete s.armies[A.id];
  return { ok: true };
}

// Columns marching to join an army: merge on arrival, follow it if it moves.
export function mergeColumns(s, fid) {
  for (const C of Object.values(s.armies)) {
    if (C.owner !== fid || !C.column) continue;
    const A = s.armies[C.column];
    if (!A || !A.legions.length) { C.column = null; continue; }
    if (C.loc === A.loc) {
      for (const id of C.legions) { const l = s.legions[id]; if (l) { l.army = A.id; A.legions.push(id); } }
      delete s.armies[C.id];
      if (fid === 'player') log(s, 'column joins', A.loc, `${C.legions.map((id) => legionName(s.legions[id] || { id })).join(', ')} ${C.legions.length === 1 ? 'joins' : 'join'} the army at ${PROV[A.loc].name}.`);
    } else if (C.dest !== A.loc && !s.pending.some((p) => p.army === C.id)) setDest(s, C, A.loc);
  }
}

// Who commands an army, in words.
export function commanderOf(s, F, A) {
  if (A.id === F.leaderArmy) return { name: 'You', style: null, skill: F.stats.virtus, you: true };
  if (A.column) return { name: 'A column on the march', style: null, skill: 0, column: true };
  const g = A.general && generalById(F, A.general);
  return g ? { name: g.name, style: g.style, skill: g.skill, id: g.id } : { name: 'A senior tribune', style: null, skill: 0 };
}

