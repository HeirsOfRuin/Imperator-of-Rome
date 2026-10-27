import { makeMan, MAX_CIRCLE } from './circle.js';
// Saves are a contract: the key never changes, the payload carries a version,
// and every old version migrates forward. The text code (IMPR1.) moves a game
// between devices; the compression lives in the UI (browser streams).
import { rngs, actOf } from './core.js';

export const SAVE_KEY = 'imperator.save';
export const SAVE_VERSION = 3;

export function toSave(s) {
  const { R, events, ...rest } = s;
  return { v: SAVE_VERSION, state: rest };
}

// Each migration takes a state of version v and returns version v + 1.
// Old saves are kept in tests/fixtures; tools/check-saves.js loads every one.
const MIGRATIONS = {
  // 1 -> 2: the playtest and depth builds. Version 1 saves come from Phase 2
  // (no story, generals, Senate, frontier peoples or trade) and from the first
  // playtest build (story and generals, but none of the rest).
  1: (s) => {
    s.senate = s.senate || { favour: {}, hostis: {} };
    s.foreign = s.foreign || { subsidy: {}, incited: {}, parthia: null };
    s.trade = s.trade || [];
    s.flags = s.flags || {};
    s.eventsSeen = s.eventsSeen || {};
    s.story = s.story || [];
    s.event = s.event || null;
    s.report = s.report || null;
    // the story should not replay what already happened before the save
    s.lastAct = s.lastAct ?? actOf(s);
    s.neroPage = s.neroPage ?? s.turn > 4;
    s.lastEmperor = s.lastEmperor ?? s.emperor;
    s.deathsSeen = s.deathsSeen || Object.fromEntries(Object.values(s.factions).filter((f) => f.kind === 'hist' && !f.alive).map((f) => [f.id, true]));
    // legions used to gather on their own: a Phase 2 save has no generals yet
    // (the first one swears at the next month's turn, ai.js humanUpkeep)
    return s;
  },
  // 2 -> 3: one circle of men per faction (circle.js). Generals and governors
  // move into it; governors keep their names and traits.
  2: (s) => {
    for (const F of Object.values(s.factions)) {
      const C = F.circle = F.circle || [];
      for (const g of F.generals || []) C.push(makeMan(g.id + '|' + s.seed, { id: g.id, name: g.name, style: g.style, command: g.skill, origin: 'sworn', loyalty: 65, since: g.since || 0 }));
      delete F.generals;
      if (F.kind === 'player' && C.length) F.firstGeneral = true;
    }
    if (s.factions.player && s.factions.player.ownsProvince) s.factions.player.firstGeneral = true;
    for (const P of Object.values(s.prov)) {
      const g = P.governor, F = s.factions[P.owner];
      if (!g || g.cid) continue;
      if (!F || F.kind === 'state' || (F.circle || []).length >= MAX_CIRCLE) { P.governor = null; continue; }
      const man = makeMan(`gov|${P.id}|${g.name}|${s.seed}`, { name: g.name, trait: g.trait, friend: g.friend || undefined, origin: g.friend ? 'friend' : 'local', since: g.since || 0 });
      if (F.circle.some((m) => m.name === man.name)) man.name += ' Minor'; // two men of one name: the Romans said 'the younger'
      F.circle.push(man);
      P.governor = { cid: man.id, name: man.name, trait: man.trait, friend: man.friend || null, since: g.since || 0 };
      P.instr = P.instr || 'manual'; // the player set these provinces up by hand: keep it that way until told otherwise
    }
    return s;
  },
};

export function fromSave(obj) {
  if (!obj || typeof obj !== 'object' || !obj.state) throw new Error('Not an Imperator save');
  let { v, state } = obj;
  if (v > SAVE_VERSION) throw new Error('This save comes from a newer version of the game');
  while (v < SAVE_VERSION) { state = MIGRATIONS[v](state); v++; }
  state.events = [];
  state.R = rngs(state);
  return state;
}
