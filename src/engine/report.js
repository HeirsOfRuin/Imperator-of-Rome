// The month's report: what changed between pressing End month and the next
// month's first look. Short on purpose: money, land, men, the news that
// touched you. Warnings and the next step are read live by view.js.
import { PROV } from './graph.js';
import { legionName, ownedLegions, ownedProvinces } from './core.js';

export function snapshot(s) {
  const P = s.factions.player;
  return {
    turn: s.turn, treasury: P.treasury, owed: ownedLegions(s, 'player').reduce((a, l) => a + l.debt, 0),
    provinces: ownedProvinces(s, 'player').map((q) => q.id),
    legions: Object.fromEntries(ownedLegions(s, 'player').map((l) => [l.id, l.men])),
    ledgerAt: s.ledger.length, dispatchesAt: s.dispatches.length, legit: P.legit,
  };
}

const GROUP = (why) => {
  const k = why.split(':')[0];
  if (k.startsWith('bought')) return 'buying men';
  if (k.startsWith('promise')) return 'promises paid';
  if (k.startsWith('building')) return 'building';
  if (k.startsWith('subsidy') || k.startsWith('gift')) return 'gifts and subsidies';
  return k;
};

export function buildReport(s, snap) {
  const P = s.factions.player;
  const money = {};
  // only what the month itself did (actions taken earlier in the month are already known)
  for (const [, x, why] of s.ledger.slice(snap.ledgerAt)) { const g = GROUP(why); money[g] = (money[g] || 0) + x; }
  const nowProv = ownedProvinces(s, 'player').map((q) => q.id);
  const nowLeg = Object.fromEntries(ownedLegions(s, 'player').map((l) => [l.id, l]));
  const menBefore = Object.values(snap.legions).reduce((a, x) => a + x, 0);
  const menNow = Object.values(nowLeg).reduce((a, l) => a + l.men, 0);
  return {
    turn: snap.turn,
    treasury: [Math.round(snap.treasury), Math.round(P.treasury)],
    money: Object.entries(money).map(([k, x]) => [k, Math.round(x)]).filter(([, x]) => x).sort((a, b) => b[1] - a[1]),
    gained: nowProv.filter((id) => !snap.provinces.includes(id)).map((id) => PROV[id].name),
    lost: snap.provinces.filter((id) => !nowProv.includes(id)).map((id) => PROV[id].name),
    legionsGained: Object.keys(nowLeg).filter((id) => !(id in snap.legions)).map((id) => legionName(nowLeg[id])),
    legionsLost: Object.keys(snap.legions).filter((id) => !nowLeg[id]).map((id) => legionName(s.legions[id] || { id })),
    men: [menBefore, menNow],
    legit: [Math.round(snap.legit), Math.round(P.legit)],
    dispatchesAt: snap.dispatchesAt, // view.js picks the news that reached you this month
  };
}
