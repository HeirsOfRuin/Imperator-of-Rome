// Governors at work: each month a governor carries out his standing
// instructions, as his trait and skill allow. You can always override him
// (set taxes yourself, or give the province 'manual'). docs/DESIGN.md §19.
import { BUILDINGS } from '../data/buildings.js';
import { PROV, ADJ } from './graph.js';
import { log } from './core.js';
import { build, canBuild, buildCost, gamesCost, holdGames } from './buildings.js';
import { governorOf } from './circle.js';
import { payOf } from './world.js';

export const INSTRUCTIONS = {
  balance: { name: 'Balance', does: 'Normal taxes, lighter when unrest climbs; builds what pays best' },
  exploit: { name: 'Exploit', does: 'Heavy taxes while the province will bear them; builds for revenue' },
  pacify: { name: 'Pacify', does: 'Light taxes and games until unrest falls; builds granaries and temples' },
  fortify: { name: 'Fortify', does: 'Normal taxes; builds camps, signal towers and levy offices' },
  develop: { name: 'Develop', does: 'Normal taxes; spends on roads, harbours and mints' },
  manual: { name: 'Manual', does: 'He does nothing on his own: you set taxes and build yourself' },
};
export const BUDGETS = [0, 40, 80, 150];

const PREFER = {
  balance: ['road', 'granary', 'temple', 'harbour', 'castra', 'mint', 'dilectus', 'limes'],
  exploit: ['road', 'mint', 'harbour', 'granary'],
  pacify: ['granary', 'temple', 'road'],
  fortify: ['castra', 'limes', 'dilectus', 'road'],
  develop: ['road', 'harbour', 'mint', 'granary', 'temple'],
};

function taxFor(instr, P, m) {
  const u = P.unrest;
  let t = 'normal';
  if (instr === 'exploit') t = u < 30 && m.trait === 'greedy' ? 'extort' : u < 45 ? 'heavy' : u < 60 ? 'normal' : 'light';
  else if (instr === 'pacify') t = u > 15 ? 'light' : 'normal';
  else t = u > 50 ? 'light' : 'normal';
  if (m.trait === 'timid' && (t === 'heavy' || t === 'extort')) t = 'normal';
  if (m.trait === 'greedy' && t === 'light' && u < 70) t = 'normal';
  return t;
}

// Monthly, for every faction that has governors from its circle.
export function governorsAct(s) {
  for (const F of Object.values(s.factions)) {
    if (!F.alive || F.kind === 'state' || F.kind === 'barbarian') continue;
    const budget = F.worksBudget ?? 80;
    let spent = 0;
    const done = [];
    // keep two months of pay in hand before any governor spends
    const reserve = payOf(s, F) * 2;
    const provs = Object.values(s.prov).filter((P) => P.owner === F.id && governorOf(s, P) && (P.instr || 'balance') !== 'manual');
    // the most skilled governors act first
    provs.sort((a, b) => governorOf(s, b).admin - governorOf(s, a).admin);
    for (const P of provs) {
      const m = governorOf(s, P), instr = P.instr || 'balance';
      const t = taxFor(instr, P, m);
      if (P.tax !== t) { P.tax = t; done.push(`${m.name} sets ${t} taxes in ${PROV[P.id].name}`); }
      // games when the province is close to trouble
      if ((instr === 'pacify' || instr === 'balance') && P.unrest >= 65 && gamesCost(s, F.id) <= budget - spent && F.treasury - gamesCost(s, F.id) > reserve && !holdGames(s, F, P.id).error) { spent += gamesCost(s, F.id); done.push(`${m.name} gives games in ${PROV[P.id].name}`); }
      // one work at a time, the most fitting first; timid men only build cheap things, able men build sooner
      if (P.building || m.trait === 'timid' && budget - spent < 150) continue;
      const order = PREFER[instr] || PREFER.balance;
      for (const bid of order) {
        const cost = buildCost(s, F.id, bid);
        if (canBuild(s, F, P.id, bid) || cost > budget - spent + (m.admin >= 4 ? 20 : 0) || F.treasury - cost < reserve) continue;
        if (bid === 'harbour' && !ADJ[P.id].some((e) => e.kind === 'sea')) continue;
        if (bid === 'limes' && !PROV[P.id].frontier) continue;
        if (!build(s, F, P.id, bid).error) { spent += cost; done.push(`${m.name} begins ${BUILDINGS[bid].name.toLowerCase()} in ${PROV[P.id].name}`); }
        break;
      }
    }
    if (F.kind === 'player' && done.length) {
      s.govLog = { t: s.turn, lines: done.slice(0, 8), more: Math.max(0, done.length - 8) };
      log(s, 'governors', null, null);
    }
  }
}
