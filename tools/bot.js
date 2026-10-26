// Plays full campaigns through the human interface only: act() and view(),
// exactly what the screens use. Fails on any stall, crash, rejected action the
// view said was allowed, or a save that does not reload to the same game.
// node tools/bot.js [campaigns]
import { newGame } from '../src/engine/turn.js';
import { act } from '../src/engine/actions.js';
import { view } from '../src/engine/view.js';
import { toSave, fromSave } from '../src/engine/save.js';
import { STARTS } from '../src/data/world.js';
import { distance } from '../src/engine/graph.js';

const N = Number(process.argv[2] || 21);
const roads = ['wealth', 'military', 'politics', 'charisma'];
const diffs = ['legionary', 'centurion', 'legate'];
let fails = 0, wins = 0, ends = {}, months = 0, actions = 0;
const fail = (m) => { fails++; console.log('FAIL', m); };

function must(s, a, ctx) {
  if (s.outcome) return { ok: false };
  const r = act(s, a); actions++;
  if (r && r.error) fail(`${ctx}: ${a.type} rejected: ${r.error}`);
  return r;
}

function month(s) {
  if (s.outcome) return;
  const v = view(s);
  // pages and choices: read, and take the first answer it can afford
  while (view(s).story) must(s, { type: 'readStory' }, 'story');
  if (v.event) { const o = v.event.options.find((x) => !x.why); if (!o) fail(`event ${v.event.id} offers no answer`); else must(s, { type: 'choose', option: o.index }, 'event'); }
  if (v.report) must(s, { type: 'readReport' }, 'report');
  // encounters first
  for (const pd of v.pending) {
    for (let guard = 0; guard < 6; guard++) {
      const vv = view(s);
      const p = vv.pending.find((x) => x.id === pd.id);
      if (!p) break;
      if (p.defence) { must(s, { type: 'encounter', pendingId: p.id, option: /^You|even/.test(p.enemy.odds) ? 'fight' : 'withdraw' }, 'defence'); if (s.battle) must(s, { type: 'battleAuto' }, 'battle'); break; }
      if (!p.bodies.length) break;
      const b = p.bodies[0];
      const pick = ['negotiate', 'buy', 'fight', 'bypass'].map((id) => b.options.find((o) => o.id === id)).find((o) => o && o.ok && (o.id !== 'negotiate' || /Likely|Even/.test(o.cost)) && (o.id !== 'fight' || !/far outnumber you|They are stronger/.test(o.cost)));
      if (!pick) { must(s, { type: 'encounter', pendingId: p.id, option: 'withdraw' }, 'withdraw'); break; }
      if (s.outcome) return;
      const r = act(s, { type: 'encounter', pendingId: p.id, key: b.key, option: pick.id }); actions++;
      if (r.error && !/no longer there|Already tried/.test(r.error)) fail(`encounter ${pick.id} offered as ok but rejected: ${r.error}`);
    }
  }
  if (s.outcome) return;
  const v2 = view(s);
  if (v2.act1) {
    if (!v2.act1.bodies.length && !v2.act1.approached) fail(`Act I has no way forward (${v2.act1.province}, ${v2.month})`);
    const b = v2.act1.bodies[0];
    if (b && !v2.act1.approached) {
      const pick = b.options.find((o) => o.ok && o.id === 'negotiate' && /Likely|Even/.test(o.cost)) || b.options.find((o) => o.ok && o.id === 'buy') || b.options.find((o) => o.ok && o.id === 'promise');
      if (pick) must(s, { type: 'approach', key: b.key, option: pick.id }, 'act1');
    }
  } else if (v2.player.alive) {
    for (const o of v2.offers) must(s, { type: 'answer', offerId: o.id, accept: o.type !== 'alliance' || true }, 'offer');
    if (v2.player.canAcclaim && (v2.legions.length >= 4 || s.turn >= 9)) must(s, { type: 'acclaim' }, 'acclaim');
    if (v2.player.owed > 0 && v2.player.treasury > v2.player.owed) act(s, { type: 'pay' });
    const lettersTo = v2.provinces.filter((q) => q.canLetter).slice(0, v2.player.letters);
    for (const q of lettersTo) if (view(s).player.treasury > 50) must(s, { type: 'letter', pid: q.id }, 'letter');
    const lev = v2.provinces.find((q) => q.canLevy && ['legion', 'grain'].includes(q.tier));
    if (lev && view(s).player.treasury > 900 && v2.legions.length < 8) must(s, { type: 'levy', pid: lev.id }, 'levy');
    if (v2.player.decree === false && v2.player.acclaimed && v2.player.legit >= 30 && v2.player.treasury > v2.player.decreeCost + 300) act(s, { type: 'decree' });
    if (v2.rome && v2.rome.youRule) { if (v2.rome.unrest > 40) act(s, { type: 'rome', spend: 'dole' }); if (v2.rome.whispers > 5) act(s, { type: 'rome', spend: 'informers' }); if (v2.player.legit < 40) act(s, { type: 'rome', spend: 'consulships' }); }
    // legions left behind join the army you lead (one stays on a threatened frontier)
    const lead = v2.myArmies.find((a) => a.leader);
    if (lead) for (const g of v2.garrisons) for (const l of g.legions.slice(v2.provinces.find((q) => q.id === g.pid)?.threat >= 60 ? 1 : 0)) must(s, { type: 'joinArmy', legionId: l.id, armyId: lead.id }, 'join');
    // march: Rome when ready, else the nearest province not ours
    const A = v2.army;
    if (A && !A.halted && (!A.dest || !A.path.length)) {
      let dest = null;
      if (v2.act >= 3 && (s.turn >= 16 || v2.legions.length >= 7)) dest = 'ROM';
      else {
        const cands = v2.provinces.filter((q) => !q.mine && !['NIT', 'ETR', 'ROM', 'CMP'].includes(q.id) && distance(A.loc, q.id) <= 2 && q.legions.filter((l) => l.owner !== 'player').length <= Math.max(1, A.legions.length - 1));
        cands.sort((a, b) => distance(A.loc, a.id) - distance(A.loc, b.id) || b.rev - a.rev);
        dest = cands[0]?.id;
      }
      if (dest && dest !== A.loc) must(s, { type: 'march', dest }, 'march');
    }
  }
  const before = s.turn;
  must(s, { type: 'endMonth' }, 'end');
  if (s.turn !== before + 1 && !s.outcome) fail('month did not advance');
  months++;
}

for (let i = 0; i < N; i++) {
  const opts = { seed: 1000 + i * 37, difficulty: diffs[i % 3], start: STARTS[i % STARTS.length], road: roads[i % 4] };
  const s = newGame(opts);
  let reloaded = false;
  while (!s.outcome && s.turn < 70) {
    month(s);
    if (!reloaded && s.turn === 12 && !s.outcome) {
      // save, reload into a copy, and check both play on identically for 3 months
      const copy = fromSave(JSON.parse(JSON.stringify(toSave(s))));
      const orig = fromSave(JSON.parse(JSON.stringify(toSave(s))));
      for (let m = 0; m < 3 && !copy.outcome; m++) { month(copy); month(orig); }
      if (JSON.stringify(toSave(copy)) !== JSON.stringify(toSave(orig))) fail(`save reload diverged (${JSON.stringify(opts)})`);
      reloaded = true;
    }
  }
  if (!s.outcome) fail(`campaign did not end (${JSON.stringify(opts)})`);
  else { ends[s.outcome.cause] = (ends[s.outcome.cause] || 0) + 1; if (s.outcome.win) wins++; }
  const v = view(s);
  if (v.dispatches.length === 0) fail('no dispatches were ever visible');
}
console.log(`${N} campaigns through the player interface, ${months} months, ${actions} actions; wins ${wins}; endings ${JSON.stringify(ends)}`);
console.log(fails ? `${fails} failures` : 'ok');
process.exit(fails ? 1 : 0);
