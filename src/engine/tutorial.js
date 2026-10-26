// The guide: the first months, one step at a time. Each step says what to do
// and which tab does it, and is done when the game state (or the screen the
// player is looking at) shows it was done. Optional; skippable; kept in the save.
// ui: { tab, dTab } from the screens, for steps that are about finding a page.

export const GUIDE = [
  { id: 'army', tab: 'army', text: 'Open the Army tab. The other legions of your province are listed there, and the governor after them, with what each approach would cost.',
    done: (s, ui) => ui.tab === 'army' || s.factions.player.approached !== undefined },
  { id: 'approach', tab: 'army', text: 'Make an approach. Talking costs nothing but may be refused; buying is sure but dear; promising money is a debt that falls due. One approach a month.',
    done: (s) => s.factions.player.approached !== undefined },
  { id: 'end', tab: null, text: 'Press End month. A short report shows what the month did: money, men, news. Read it, then carry on.',
    done: (s) => s.turn >= 1 },
  { id: 'province', tab: 'army', text: 'Keep going until three-quarters of the men here are yours, then win over the governor. The province, and its treasury, will be yours.',
    done: (s) => s.factions.player.ownsProvince },
  { id: 'build', tab: 'realm', text: 'Open Provinces and press Build. Works cost money now and pay every month after. While you are there, look at the taxes: more money, more unrest.',
    done: (s) => Object.values(s.prov).some((P) => P.owner === 'player' && (P.building || (P.buildings || []).length)) },
  { id: 'march', tab: 'map', text: 'On the map, tap a neighbouring province and choose March. Your army meets whoever holds it, and you decide what to do.',
    done: (s) => Object.values(s.armies).some((A) => A.owner === 'player' && A.dest && A.dest !== A.loc) || Object.values(s.prov).filter((P) => P.owner === 'player').length >= 2 },
  { id: 'senate', tab: 'diplomacy', text: 'Open Powers, then Senate. The Senate confers the throne: court it, and put a motion when you can. Rivals, frontier peoples and trade are on the same tab.',
    done: (s, ui) => (ui.tab === 'diplomacy' && ui.dTab === 'senate') || s.factions.player.courtTurn !== undefined || s.factions.player.motionTurn !== undefined },
  { id: 'done', tab: null, text: 'That is the essentials. From here the "Now" line will point the way. Be hailed imperator when you are strong enough, and march on Rome.', done: () => false },
];

export function guideView(s) {
  const g = s.tutorial;
  if (!g || g.off) return null;
  const step = GUIDE[g.step];
  if (!step) return null;
  return { index: g.step, count: GUIDE.length - 1, id: step.id, text: step.text, tab: step.tab, last: step.id === 'done' };
}

// Advance past every step already done (several can finish at once).
export function guideCheck(s, ui) {
  const g = s.tutorial;
  if (!g || g.off) return false;
  let moved = false;
  while (GUIDE[g.step] && GUIDE[g.step].id !== 'done' && GUIDE[g.step].done(s, ui || {})) { g.step++; moved = true; }
  return moved;
}

export function guideAct(s, a) {
  if (a.start) { s.tutorial = { step: 0 }; return { ok: true }; }
  if (!s.tutorial) return { error: 'No guide' };
  if (a.skip || a.finish) { s.tutorial.off = true; return { ok: true }; }
  return { ok: true, moved: guideCheck(s, a.ui) };
}
