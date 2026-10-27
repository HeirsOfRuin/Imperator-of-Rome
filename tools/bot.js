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
      if (p.defence) { must(s, { type: 'encounter', pendingId: p.id, option: /^You|even/.test(p.enemy.odds) ? 'fight' : 'withdraw' }, 'defence'); if (s.battle) { must(s, { type: 'battleAuto' }, 'battle'); must(s, { type: 'battleRound' }, 'battle result'); } break; }
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
    if (v2.rome && v2.rome.youRule) { if (v2.rome.unrest > 40) act(s, { type: 'rome', spend: 'dole' }); if (v2.rome.whispers > 5) act(s, { type: 'rome', spend: 'informers' }); if (v2.player.legit < 40) act(s, { type: 'rome', spend: 'consulships' }); }
    // the Senate, the frontiers, trade: whatever the screens offer and the purse allows
    const S = view(s).senate; // fresh: money spent above changes what the Senate will hear
    const m = S.motions.find((x) => !x.why && (x.id !== 'exiles' || v2.player.treasury > 500));
    if (m) must(s, { type: 'motion', motion: m.id }, 'motion');
    if (!S.courted && S.favour < 40 && view(s).player.treasury > 500) must(s, { type: 'court' }, 'court');
    for (const q of v2.peoples) if (!q.why.subsidy && q.threat >= 70 && view(s).player.treasury > q.subsidy * 3) must(s, { type: 'people', people: q.id, what: 'subsidy' }, 'subsidy');
    for (const f of v2.factions) if (f.alive && f.treaty && !f.trading && f.tradeEval && f.tradeEval.ok && view(s).player.envoys > 0) act(s, { type: 'propose', to: f.id, kind: 'trade' });
    // governors: take on a local man for each province while the circle has room, on Balance
    for (const q of view(s).provinces.filter((x) => x.mine && !x.governor).slice(0, 2)) {
      const c = q.locals && q.locals[0];
      if (c && view(s).circle.length < view(s).maxCircle) { must(s, { type: 'appoint', pid: q.id, cid: c.id, local: true }, 'appoint'); must(s, { type: 'instr', pid: q.id, instr: s.turn % 2 ? 'balance' : 'develop' }, 'instr'); }
    }
    // restless men: a gift, else a marriage, else a hostage
    for (const id of view(s).circle.filter((x) => x.restless && !x.hostage).map((x) => x.id)) { const m = view(s).circle.find((x) => x.id === id); if (m) must(s, { type: 'honour', cid: id, kind: m.canGift ? 'gift' : m.canMarry ? 'marry' : 'hostage' }, 'honour'); }
    // a big army splits: half to a free general
    { const L = view(s).myArmies.find((x) => x.leader); const g = view(s).generals.find((x) => !x.army); if (L && L.legions.length >= 6 && g && !L.halted) must(s, { type: 'split', armyId: L.id, general: g.id }, 'split'); }
    // a general for any army without one, and orders for every general's army
    for (const a of view(s).myArmies.filter((x) => !x.leader && !x.column && !x.canOrder)) { const g = view(s).generals.find((x) => !x.army); if (g) act(s, { type: 'assignGeneral', armyId: a.id, general: g.id }); }
    for (const a of view(s).myArmies.filter((x) => x.canOrder)) must(s, { type: 'orders', armyId: a.id, order: ['expand', 'guard', 'hunt', 'support', 'hold'][(s.turn + a.id.length) % 5] }, 'orders');
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
// the guide: it must walk a real game forward, step by step, to its end
{
  let tested = false;
  for (let seed = 70; seed < 100 && !tested; seed++) {
    const g = newGame({ seed, difficulty: 'legionary', start: 'SYR', road: 'wealth', guide: true });
    const seen = [];
    while (!g.outcome && g.turn < 24) {
      for (const ui of [{ tab: 'map' }, { tab: 'army' }, { tab: 'realm' }, { tab: 'diplomacy', dTab: 'senate' }]) act(g, { type: 'guide', ui });
      const v = view(g); if (v.guide && seen[seen.length - 1] !== v.guide.id) seen.push(v.guide.id);
      if (v.guide && v.guide.id === 'build') { const q = v.provinces.find((p) => p.mine && p.works.some((w) => !w.why)); if (q) act(g, { type: 'build', pid: q.id, building: q.works.find((w) => !w.why).id }); }
      month(g);
    }
    if (g.outcome) continue; // died before the guide could finish: try another campaign
    tested = true;
    const v = view(g);
    console.log(`guide (seed ${seed}): ${seen.join(' > ')}`);
    if (!v.guide || v.guide.id !== 'done') fail(`the guide stopped at "${v.guide && v.guide.id}"`);
  }
  if (!tested) fail('no guided campaign survived long enough to test the guide');
}
console.log(`${N} campaigns through the player interface, ${months} months, ${actions} actions; wins ${wins}; endings ${JSON.stringify(ends)}`);
console.log(fails ? `${fails} failures` : 'ok');
process.exit(fails ? 1 : 0);
