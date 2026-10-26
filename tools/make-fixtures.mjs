// Make save fixtures: real saves from a build, at the moments that matter.
// Run it against an old checkout to keep that build's saves for the loader:
//   ROOT=/path/to/old/checkout LABEL=phase2 node tools/make-fixtures.mjs
// Output: tests/fixtures/<label>-<scenario>.json (the save, exactly as the
// game stores it under 'imperator.save'). Plays through act() and view()
// only, with whatever features that build has.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.env.ROOT || process.cwd());
const LABEL = process.env.LABEL || 'current';
const OUT = resolve(process.env.OUT || join(process.cwd(), 'tests/fixtures'));
const E = (f) => import(join(ROOT, 'src/engine', f));
const { newGame, bedriacum } = await E('turn.js');
const { act } = await E('actions.js');
const { view } = await E('view.js');
const { toSave } = await E('save.js');
const { distance } = await E('graph.js');

function clear(s) {
  for (let g = 0; g < 20 && !s.outcome; g++) {
    const v = view(s);
    if (v.story) { act(s, { type: 'readStory' }); continue; }
    if (v.report) { act(s, { type: 'readReport' }); continue; }
    if (v.event) { const o = v.event.options.find((x) => !x.why && !/Ends/.test(x.hint)); act(s, { type: 'choose', option: o ? o.index : v.event.options.length - 1 }); continue; }
    break;
  }
}
function month(s) {
  clear(s);
  if (s.outcome) return;
  let v = view(s);
  for (const pd of v.pending) {
    if (pd.defence) { act(s, { type: 'encounter', pendingId: pd.id, option: /^You|even/.test(pd.enemy.odds) ? 'fight' : 'withdraw' }); continue; }
    const b = pd.bodies[0];
    const o = b && ['negotiate', 'buy', 'fight', 'bypass'].map((id) => b.options.find((x) => x.id === id)).find((x) => x && x.ok && (x.id !== 'fight' || !/outnumber you|They are stronger/.test(x.cost)));
    act(s, o ? { type: 'encounter', pendingId: pd.id, key: b.key, option: o.id } : { type: 'encounter', pendingId: pd.id, option: 'withdraw' });
  }
  if (s.battle) act(s, { type: 'battleAuto' });
  v = view(s);
  if (v.act1 && !v.act1.approached && v.act1.bodies[0]) {
    const b = v.act1.bodies[0];
    const o = b.options.find((x) => x.ok && x.id === 'negotiate' && /Likely|Even/.test(x.cost)) || b.options.find((x) => x.ok && x.id === 'buy') || b.options.find((x) => x.ok && x.id === 'promise') || b.options.find((x) => x.ok && x.id === 'negotiate');
    if (o) act(s, { type: 'approach', key: b.key, option: o.id });
  } else if (!v.act1 && v.player.alive) {
    for (const o of v.offers) act(s, { type: 'answer', offerId: o.id, accept: true });
    if (v.player.canAcclaim && (v.legions.length >= 3 || s.turn >= 9)) act(s, { type: 'acclaim' });
    if (v.senate) { const m = v.senate.motions.find((x) => !x.why); if (m) act(s, { type: 'motion', motion: m.id }); }
    const lead = v.myArmies ? v.myArmies.find((a) => a.leader) : null;
    if (lead) for (const g of v.garrisons) for (const l of g.legions) act(s, { type: 'joinArmy', legionId: l.id, armyId: lead.id });
    const A = v.army;
    if (A && !A.halted && (!A.dest || !A.path.length)) {
      const c = v.provinces.filter((q) => !q.mine && !['NIT', 'ETR', 'ROM', 'CMP'].includes(q.id) && distance(A.loc, q.id) <= 2 && q.legions.filter((l) => l.owner !== 'player').length <= Math.max(1, A.legions.length - 1)).sort((a, b) => distance(A.loc, a.id) - distance(A.loc, b.id))[0];
      if (c) act(s, { type: 'march', dest: c.id });
    }
  }
  act(s, { type: 'endMonth' });
}
const until = (s, f, cap = 40) => { while (!s.outcome && !f(s) && s.turn < cap) month(s); clear(s); return s; };
const game = (start, road, seed) => newGame({ seed, difficulty: 'centurion', start, road, name: 'Gaius Valerius Corvus' });

const scenarios = {
  act1: () => until(game('GSU', 'politics', 11), (s) => s.turn >= 2),
  province: () => { const s = until(game('SYR', 'wealth', 12), (x) => view(x).act >= 2); for (let i = 0; i < 2 && !s.outcome; i++) month(s); clear(s); return s; },
  act3: () => until(game('PAN', 'military', 13), (x) => view(x).act >= 3 && x.turn >= 12),
  late: () => until(game('DAL', 'charisma', 14), (x) => x.turn >= 24),
  battle: () => { const s = bedriacum({ seed: 15 }); act(s, { type: 'battleRound' }); act(s, { type: 'battleRound' }); return s; },
};
mkdirSync(OUT, { recursive: true });
for (const [name, f] of Object.entries(scenarios)) {
  const s = f();
  const v = view(s);
  writeFileSync(join(OUT, `${LABEL}-${name}.json`), JSON.stringify(toSave(s)));
  console.log(`${LABEL}-${name}: ${v.month}, act ${v.act}${s.battle ? ', mid-battle' : ''}${s.outcome ? ', ended: ' + s.outcome.cause : ''}`);
}
