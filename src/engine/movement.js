import { ADJ, edgeCost, isWinter, route } from './graph.js';
import { bodiesAt, cull, flipProvince, hostile } from './core.js';
import { resolveEncounter } from './combat.js';

export function movement(s) {
  const winter = isWinter(s.turn);
  const order = Object.values(s.armies).sort((a, b) => a.id < b.id ? -1 : 1);
  for (const A of order) {
    if (!s.armies[A.id] || !A.legions.length) { delete s.armies[A.id]; continue; }
    const F = s.factions[A.owner];
    if (!F.alive) continue;
    if (A.bypassed) {
      for (const id of A.legions) { const l = s.legions[id]; l.men = Math.round(l.men * (1 - Math.min(0.04, 0.01 * A.bypassed))); l.loyalty -= 1; }
      A.bypassed = Math.max(0, A.bypassed - 1);
    }
    if (A.wait > 0) { A.wait--; continue; }
    if (s.pending && s.pending.some((p) => p.army === A.id)) continue;
    if (!A.path.length) { engage(s, A, A.loc, true); continue; }
    if (A.edgeLeft <= 0) {
      const e = ADJ[A.loc].find((x) => x.to === A.path[0]);
      if (!e) { A.path = []; continue; }
      A.edgeLeft = edgeCost(e, winter);
      A.edgeKind = e.kind;
    }
    A.edgeLeft--;
    if (A.edgeLeft > 0) continue;
    if (winter && A.edgeKind !== 'land') for (const id of A.legions) s.legions[id].men = Math.round(s.legions[id].men * (A.edgeKind === 'alps' ? 0.94 : 0.97));
    A.from = A.loc;
    A.loc = A.path.shift();
    for (const id of A.legions) s.legions[id].loc = A.loc;
    const res = engage(s, A, A.loc, A.loc === A.dest || !A.path.length);
    if (res === 'halt') continue;
    if (res === 'blocked' && s.armies[A.id]) { A.loc = A.from; for (const id of A.legions) s.legions[id].loc = A.loc; A.path.unshift(A.dest ? A.path[0] || A.dest : A.loc); A.path = route(A.loc, A.dest, winter); }
  }
  cull(s);
}

export function engage(s, A, pid, destination) {
  const F = s.factions[A.owner];
  let guard = 0;
  while (guard++ < 8 && s.armies[A.id] && A.legions.length && F.alive) {
    const bodies = bodiesAt(s, F.id, pid);
    if (!bodies.length) break;
    // armies first, then legions, then the garrison
    bodies.sort((a, b) => (a.kind === 'army' ? 0 : a.kind === 'legion' ? 1 : 2) - (b.kind === 'army' ? 0 : b.kind === 'legion' ? 1 : 2));
    const b = bodies[0];
    if (F.kind === 'player' && s.opts.human) {
      if (!s.pending.some((p) => p.army === A.id)) s.pending.push({ id: s.nextId++, army: A.id, prov: pid, destination, turn: s.turn });
      return 'halt';
    }
    // the state does not attack peaceful governors' provinces on its own
    if (F.kind === 'state' && b.kind === 'aux') break;
    const res = resolveEncounter(s, F, A, b, { destination });
    if (res === 'battle') return 'halt';
    if (res === 'lost' || res === 'blocked') return res;
  }
  if (!s.armies[A.id] || !A.legions.length) return 'lost';
  if (!bodiesAt(s, F.id, pid).length) {
    const P = s.prov[pid];
    if (P.owner !== F.id && (hostile(s, F.id, P.owner) || (P.owner === 'state' && F.kind !== 'state' && s.emperor !== F.id))) flipProvince(s, P, F.id, P.aux > 0);
  }
  return 'ok';
}
