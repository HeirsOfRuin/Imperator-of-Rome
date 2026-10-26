// Save fixtures: every save in tests/fixtures must still load, migrate to the
// current version, show on every screen without broken numbers, play on for
// six months through the player's actions, and survive a save and reload.
// When the save format changes: add a migration in src/engine/save.js, then
// keep the old fixtures and add new ones (LABEL=... node tools/make-fixtures.mjs).
// node tools/check-saves.js
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromSave, toSave, SAVE_VERSION } from '../src/engine/save.js';
import { act } from '../src/engine/actions.js';
import { view } from '../src/engine/view.js';

const DIR = join(process.cwd(), 'tests/fixtures');
let fails = 0;
const fail = (f, m) => { fails++; console.log(`FAIL ${f}: ${m}`); };
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
if (!files.some((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')).v === SAVE_VERSION)) { fails++; console.log(`FAIL no fixture at the current version ${SAVE_VERSION}: make one with tools/make-fixtures.mjs`); }

function bad(v) {
  const j = JSON.stringify(v);
  const m = j.match(/NaN|Infinity|"undefined|undefined"|\[object Object\]/);
  return m ? m[0] : null;
}
function invariants(s, f, when) {
  for (const l of Object.values(s.legions)) {
    if (!s.factions[l.owner]) fail(f, `${when}: legion ${l.id} owned by unknown ${l.owner}`);
    if (l.army && !s.armies[l.army]?.legions.includes(l.id)) fail(f, `${when}: legion ${l.id} points at army ${l.army} that does not hold it`);
    if (!Number.isFinite(l.men) || !Number.isFinite(l.loyalty)) fail(f, `${when}: legion ${l.id} has broken numbers`);
  }
  for (const A of Object.values(s.armies)) for (const id of A.legions) if (s.legions[id]?.army !== A.id) fail(f, `${when}: army ${A.id} holds ${id}, which points elsewhere`);
  for (const F of Object.values(s.factions)) if (!Number.isFinite(F.treasury) || !Number.isFinite(F.legit)) fail(f, `${when}: faction ${F.id} has broken money or legitimacy`);
}
// Clear whatever the screens would put in front of the player, as the screens would.
function clear(s) {
  for (let g = 0; g < 20 && !s.outcome; g++) {
    const v = view(s);
    if (v.battle) { const r = act(s, { type: v.battle.over ? 'battleRound' : 'battleAuto' }); if (r.error) return r.error; continue; }
    if (v.report) { act(s, { type: 'readReport' }); continue; }
    if (v.story) { act(s, { type: 'readStory' }); continue; }
    if (v.event) { const o = v.event.options.find((x) => !x.why && !/Ends/.test(x.hint)); const r = act(s, { type: 'choose', option: o ? o.index : v.event.options.length - 1 }); if (r.error) return r.error; continue; }
    return null;
  }
  return null;
}

for (const f of files) {
  const raw = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  let s;
  try { s = fromSave(JSON.parse(JSON.stringify(raw))); } catch (e) { fail(f, `does not load: ${e.message}`); continue; }
  invariants(s, f, 'loaded');
  if (raw.v < SAVE_VERSION && (s.story || []).length > 1) fail(f, `migration replays ${s.story.length} story pages that happened before the save`);
  let v;
  try { v = view(s); } catch (e) { fail(f, `view crashes: ${e.message}`); continue; }
  const b = bad(v);
  if (b) fail(f, `view shows "${b}"`);
  const turn0 = s.turn;
  let months = 0;
  try {
    for (let i = 0; i < 6 && !s.outcome && s.factions.player.alive; i++) {
      const e1 = clear(s);
      if (e1) fail(f, `month ${s.turn}: ${e1}`);
      if (s.outcome) break;
      const before = s.turn;
      const r = act(s, { type: 'endMonth' });
      if (r.error) { fail(f, `endMonth refused: ${r.error}`); break; }
      if (s.turn !== before + 1 && !s.outcome) { fail(f, 'the month did not advance'); break; }
      months++;
      if (months === 1) {
        // the first month after loading must not retell what happened before the save
        const ROMAN = { II: 2, III: 3, IV: 4 };
        for (const p of s.story || []) {
          const m = /^Act (II|III|IV)\b/.exec(p.title);
          if (m && ROMAN[m[1]] <= v.act) fail(f, `replays "${p.title}" after loading in act ${v.act}`);
          if (/Nero is dead/.test(p.title) && turn0 > 4) fail(f, 'replays the news of Nero\'s death');
        }
      }
      invariants(s, f, `month ${s.turn}`);
      const bb = bad(view(s));
      if (bb) fail(f, `month ${s.turn}: view shows "${bb}"`);
    }
  } catch (e) { fail(f, `crash playing on: ${e.stack.split('\n').slice(0, 2).join(' ')}`); continue; }
  // a save of the played-on game reloads to the same game
  const out = toSave(s);
  if (out.v !== SAVE_VERSION) fail(f, `saved as version ${out.v}, not ${SAVE_VERSION}`);
  const again = toSave(fromSave(JSON.parse(JSON.stringify(out))));
  if (JSON.stringify(again) !== JSON.stringify(out)) fail(f, 'save, reload, save is not identical');
  console.log(`${f.padEnd(28)} v${raw.v} → v${SAVE_VERSION}  ${v.month}  played on ${months} month${months === 1 ? '' : 's'} from turn ${turn0}${s.outcome ? ` (${s.outcome.cause})` : ''}`);
}
console.log(fails ? `${fails} failures` : `ok: ${files.length} fixtures`);
process.exit(fails ? 1 : 0);
