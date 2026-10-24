// Is the field tactical, not arithmetic? (docs/FRAME-BATTLE.md targets)
// Plays many battles between equal, smaller or larger armies, our side on
// several policies, theirs on a random general type. node tools/measure-battle.js [battles]
import { setupBattle, autoBattle, aiOrders, orderBlocked, sectorState, ORDERS, GENERALS } from '../src/engine/battle.js';
import { makeRng } from '../src/engine/rng.js';
import { seRate } from './stats.js';

const N = Number(process.argv[2] || 600);
const legions = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, men: 4600, exp: 1, loyalty: 60, group: 'rhine' }));

// careful hand play: methodical, plus what a thinking player knows (his general's
// character, the state of each line) and the special moves
function careful(b, key, r) {
  aiOrders(b, key, r, 'legates');
  const me = b.sides[key], them = b.sides[key === 'att' ? 'def' : 'att'];
  for (let k = 0; k < 3; k++) {
    const S = me.sectors[k];
    if (S.routed) continue;
    const mine = sectorState(me, k), theirs = sectorState(them, k);
    const shaken = (me.sectors[k].history.slice(-1)[0] === 'pila');
    const hisLast = them.sectors[k].history.slice(-1)[0];
    if (S.dist === 1) S.order = mine.pila >= 0.5 ? 'pila' : (them.general === 'impetuous' ? 'hold' : 'advance');
    if (S.dist !== 0) continue;
    const hisCharge = them.general === 'impetuous' ? theirs.end > 40 : hisLast !== 'charge' && theirs.end > 60 && them.general === 'cunning';
    if (mine.end < 40 && !orderBlocked(me, k, 'relieve') && !hisCharge) S.order = 'relieve';
    else if ((theirs.end < 35 || theirs.morale < 35 || shaken) && mine.end > 40 && !hisCharge) S.order = 'charge';
    else S.order = 'hold';
  }
  if (!me.reserveUsed) { let w = null, wm = 50; for (let k = 0; k < 3; k++) { const st = sectorState(me, k); if (!st.routed && me.sectors[k].dist === 0 && st.morale < wm) { wm = st.morale; w = k; } } me.reserveOrder = w; }
  if (b.round >= 5 && me.gratia >= 3) me.legate = { action: 'appeal', target: 1 };
  else if (!me.ruseUsed && them.general === 'impetuous' && me.sectors[1].dist === 0) me.legate = { action: 'ruse', target: 1 };
}
const random = (b, key, r) => {
  const me = b.sides[key];
  for (let k = 0; k < 3; k++) { const ok = ORDERS.filter((o) => !orderBlocked(me, k, o)); me.sectors[k].order = r.pick(ok); }
  for (const c of me.cav) c.order = r.pick(['screen', 'charge', 'pursue']);
  me.reserveOrder = r.chance(0.2) ? r.int(3) : null;
};
const always = (o) => (b, key, r) => { aiOrders(b, key, r, 'legates'); const me = b.sides[key]; for (let k = 0; k < 3; k++) { const S = me.sectors[k]; S.order = orderBlocked(me, k, o) ? (S.dist ? 'advance' : 'hold') : o; } };
const noRelief = (b, key, r) => { aiOrders(b, key, r, 'legates'); const me = b.sides[key]; for (let k = 0; k < 3; k++) if (me.sectors[k].order === 'relieve') me.sectors[k].order = 'hold'; };

const POLICIES = { careful, auto: 'legates', random, 'always charge': always('charge'), 'always hold': always('hold'), 'never relieve': noRelief };
const MATCHUPS = { 'even 4 v 4': [4, 4], 'outnumbered 4 v 6': [4, 6], 'outnumber 6 v 4': [6, 4] };

const r0 = makeRng(7);
console.log(`battles per cell: ${N}; win = the enemy breaks or is outlasted (draws count as not winning)`);
console.log('policy'.padEnd(15) + Object.keys(MATCHUPS).map((m) => m.padStart(19)).join('') + '   rounds');
for (const [pname, pol] of Object.entries(POLICIES)) {
  const cells = [];
  let rounds = 0, battles = 0;
  for (const [mine, theirs] of Object.values(MATCHUPS)) {
    let w = 0, dr = 0;
    for (let i = 0; i < N; i++) {
      const gen = GENERALS[i % 4];
      const b = setupBattle({ id: i, loc: 'NIT', seed: 1000 + i, turn: 20, player: null,
        att: { fid: 'a', legions: legions(mine, 'A'), virtus: 3, gratia: 3, general: 'methodical' },
        def: { fid: 'd', legions: legions(theirs, 'D'), virtus: 3, gratia: 3, general: gen } });
      autoBattle(b, { att: pol, def: gen });
      if (b.winner === 'att') w++; else if (b.winner === 'draw') dr++;
      rounds += b.round; battles++;
    }
    cells.push(`${(100 * w / N).toFixed(0)}%/${(100 * dr / N).toFixed(0)}d ±${seRate(w / N, N).toFixed(0)}`.padStart(19));
  }
  console.log(pname.padEnd(15) + cells.join('') + `   ${(rounds / battles).toFixed(1)}`);
}
void r0;
