// The UI: renders view(state) and sends actions. It computes nothing itself.
import { newGame, bedriacum } from '../engine/turn.js';
import { FieldView } from './field.js';
import { act } from '../engine/actions.js';
import { view } from '../engine/view.js';
import { toSave, fromSave, SAVE_KEY } from '../engine/save.js';
import { STARTS, BACKGROUND, PROVINCES } from '../data/world.js';
import { lsGet, lsSet, lsDel, STORAGE_OK } from './storage.js';
import { registerSW } from './sw-register.js';
import { MapView } from './map.js';

const PNAME = Object.fromEntries(PROVINCES.map((p) => [p.id, p.name]));
const $app = document.getElementById('app');
let S = null, V = null;
let screen = 'title';          // title | newgame | game
let tab = 'map', sel = null, modalOff = -1, toastT = null, pTab = 'overview';
const ng = { difficulty: 'centurion', start: 'GSU', road: 'politics', custom: false, bg: {}, name: '' };
const map = new MapView((pid) => { if (sel !== pid) pTab = 'overview'; sel = pid; render(); });
let bChip = 'sector:1', bSel = null, bRoundSeen = -1;
const field = new FieldView((id) => { bSel = id; render(); });

const ICON8 = {
  road: '<rect x="0" y="5" width="8" height="2" fill="#B9A981"/><rect x="1" y="5" width="1" height="1" fill="#6C6762"/><rect x="5" y="6" width="1" height="1" fill="#6C6762"/>',
  granary: '<rect x="1" y="3" width="6" height="5" fill="#B0803A"/><rect x="0" y="2" width="8" height="1" fill="#8C6239"/><rect x="3" y="5" width="2" height="3" fill="#2B2826"/>',
  harbour: '<rect x="0" y="5" width="8" height="3" fill="#5E7088"/><rect x="2" y="1" width="1" height="4" fill="#2B2826"/><rect x="3" y="1" width="3" height="3" fill="#F6F4F0"/>',
  castra: '<rect x="1" y="3" width="6" height="4" fill="#6C6762"/><rect x="1" y="2" width="1" height="1" fill="#6C6762"/><rect x="3" y="2" width="2" height="1" fill="#6C6762"/><rect x="6" y="2" width="1" height="1" fill="#6C6762"/><rect x="3" y="5" width="2" height="2" fill="#2B2826"/>',
  limes: '<rect x="3" y="1" width="2" height="7" fill="#6C6762"/><rect x="2" y="0" width="4" height="1" fill="#C8102E"/>',
  dilectus: '<rect x="3" y="1" width="2" height="2" fill="#2B2826"/><rect x="2" y="3" width="4" height="4" fill="#C8102E"/><rect x="1" y="4" width="1" height="3" fill="#C9A227"/>',
  mint: '<circle cx="4" cy="4" r="3" fill="#C9A227"/><rect x="3" y="3" width="2" height="2" fill="#E8D48A"/>',
  temple: '<rect x="0" y="7" width="8" height="1" fill="#B9BDC3"/><rect x="1" y="3" width="1" height="4" fill="#DADDE1"/><rect x="3" y="3" width="1" height="4" fill="#DADDE1"/><rect x="5" y="3" width="1" height="4" fill="#DADDE1"/><rect x="0" y="2" width="8" height="1" fill="#B9BDC3"/><rect x="2" y="1" width="4" height="1" fill="#B9BDC3"/>',
};
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const A = (o) => `data-a='${JSON.stringify(o).replace(/'/g, '&#39;')}'`;
const n = (x) => Number(x).toLocaleString('en-US');

// ---------- persistence
function save() { if (S) lsSet(SAVE_KEY, JSON.stringify(toSave(S))); }
function loadSaved() { const raw = lsGet(SAVE_KEY); if (!raw) return null; try { return fromSave(JSON.parse(raw)); } catch { return null; } }
async function exportCode() {
  const json = JSON.stringify(toSave(S));
  try {
    const cs = new CompressionStream('deflate-raw');
    const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
    let bin = ''; for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    return 'IMPR1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch { return 'IMPR0.' + btoa(unescape(encodeURIComponent(json))); }
}
async function importCode(code) {
  code = code.trim();
  let json;
  if (code.startsWith('IMPR1.')) {
    const b64 = code.slice(6).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  } else if (code.startsWith('IMPR0.')) json = decodeURIComponent(escape(atob(code.slice(6))));
  else throw new Error('Not an Imperator save code');
  return fromSave(JSON.parse(json));
}

// ---------- actions
function toast(msg, kind = '') {
  clearTimeout(toastT);
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  document.body.appendChild(t);
  toastT = setTimeout(() => t.remove(), 2600);
}
function doAct(a) {
  const r = act(S, a);
  if (r && r.error) toast(r.error, 'bad');
  else if (a.type === 'propose' && r) toast(r.ok === null ? 'Your envoy is on the road.' : r.ok ? 'Accepted.' : `Refused: ${(r.reasons || []).join('; ') || 'no reason given'}.`, r.ok ? 'good' : r.ok === null ? '' : 'bad');
  else if (a.type === 'letter') toast(r.result === 'won' ? 'The governor declares for you.' : 'The governor sends your envoy back.', r.result === 'won' ? 'good' : 'bad');
  else if (a.type === 'subvert') toast(r.ok ? 'The legion comes over to you.' : 'The legion stays loyal.' + (r.discovered ? ' Worse: you were found out.' : ''), r.ok ? 'good' : 'bad');
  else if (a.type === 'client') toast(r.ok ? 'He sends men.' : `He refuses: ${(r.reasons || []).join('; ')}.`, r.ok ? 'good' : 'bad');
  else if (a.type === 'encounter' || a.type === 'approach') toast(resultText(r.result), r.result === 'cleared' ? 'good' : r.result === 'lost' || r.result === 'refused' ? 'bad' : '');
  else if (a.type === 'endMonth') { modalOff = -1; toast(V ? view(S).month : '', ''); }
  else if (a.type === 'battleRound' && r && r.result) toast(r.result === 'won' ? 'Victory.' : r.result === 'lost' ? 'Defeat.' : 'Neither army broke.', r.result === 'won' ? 'good' : 'bad');
  refresh();
  return r;
}
function resultText(r) {
  return { cleared: 'Done: they are yours or out of the way.', aside: 'They stand aside for now.', lost: 'Beaten. Your men fall back.', blocked: 'You could not get past.', refused: 'They refuse.', withdrew: 'You fall back.' }[r] || '';
}
function refresh() { V = view(S); save(); render(); }

// ---------- rendering
function hud() {
  const p = V.player;
  return `<div class="hud"><span class="turn">${esc(V.month)}</span><span>${n(p.treasury)}k <b>denarii</b></span><span>Legit. <b>${p.legit}</b></span><span class="${p.owed > p.treasury ? 'bad' : ''}">Owed <b>${n(p.owed)}k</b></span></div>`;
}

const ICONS = {
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.5"/>',
  realm: '<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.6"/>',
  army: '<path d="M7 21V4M7 4h10l-2 3 2 3H7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  diplomacy: '<path d="M4 12l4-4 4 4 4-4 4 4M6 14l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  rome: '<path d="M4 20h16M6 20V10M10 20V10M14 20V10M18 20V10M3 10h18L12 4z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  dispatches: '<path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10h8M8 14h8" stroke="currentColor" stroke-width="1.5"/>',
  legate: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 21c1-5 15-5 16 0" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};
function nav() {
  const tabs = [['map', 'Map'], ['realm', 'Provinces'], ['army', 'Army'], ['diplomacy', 'Diplomacy'], ...(V.rome ? [['rome', 'Rome']] : []), ['dispatches', 'News'], ['legate', 'Legate']];
  const dots = { army: V.pending.length > 0 || (V.act1 && !V.act1.approached), diplomacy: V.offers.length > 0, rome: !!(V.rome && V.rome.plotWarned) };
  return `<nav class="nav"><div class="nav-in">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[id]}</svg>${dots[id] ? '<i class="dot"></i>' : ''}${label}</button>`).join('')}</div></nav>`;
}

function render() {
  if (screen === 'title') return renderTitle();
  if (screen === 'newgame') return renderNewGame();
  if (V.outcome || !V.player.alive) return renderEnd();
  if (V.battle) return renderBattle();
  const body = { map: mapScreen, realm: realmScreen, army: armyScreen, diplomacy: diplomacyScreen, rome: romeScreen, dispatches: dispatchScreen, legate: legateScreen }[tab] || mapScreen;
  $app.innerHTML = hud() + body() + nav() + `<button class="endmonth" data-act="end-turn">End month${V.pending.length ? '<small>undecided: your army falls back</small>' : ''}</button>` + modal();
  if (tab === 'map') {
    const wrap = document.getElementById('mapwrap');
    map.attach(wrap);
    map.update(V, sel);
  }
}

// ---------- title and new game
function renderTitle() {
  const saved = loadSaved();
  $app.innerHTML = `<div class="title"><h1>Imperator</h1><div class="laurel">ROME · AD 68</div>
    <p class="note">Nero is failing. Four men will try for the throne. You will be the fifth, and the last.</p>
    ${saved && !saved.outcome ? `<button class="btn primary" data-act="continue">Continue · ${esc(view(saved).month)}</button>` : ''}
    <button class="btn ${saved && !saved.outcome ? '' : 'primary'}" data-act="new">New campaign</button>
    <button class="btn" data-act="bedriacum">Fight Second Bedriacum (AD 69)</button>
    <details style="margin-top:14px;text-align:left"><summary class="note">Load a save code</summary><textarea class="code" id="imp" placeholder="IMPR1.…"></textarea><button class="btn block" data-act="import">Load</button></details>
    ${STORAGE_OK ? '' : '<p class="note" style="color:var(--crimson)">This browser will not keep saves. Use save codes (Legate tab).</p>'}
  </div>`;
}

const DIFF = {
  legionary: ['Legionary', 'Rivals slower and fewer; hold Rome 12 months.'],
  centurion: ['Centurion', 'The war as it was; hold Rome 18 months.'],
  legate: ['Legate', 'Every rival against the front-runner; hold Rome 24 months.'],
};
const START_INFO = {
  BRI: 'Three legions; isolated and safe behind the Channel.', GSU: 'Three legions on the Rhine; Vitellius and Verginius Rufus next door.',
  PAN: 'Two legions; the Danube legions are the swing vote.', MOE: 'Two legions; the Roxolani at your back.',
  DAL: 'Two legions; closest to Italy, and exposed.', AFR: 'One legion and Rome\'s grain. Clodius Macer\'s road.',
  SYR: 'Four legions and the riches of the East; Vespasian next door.',
};
const ROADS = { wealth: ['Wealth', 'Buy legions, governors and senators'], military: ['Military', 'Take legions by beating them'], politics: ['Politics', 'Law, letters and the Senate'], charisma: ['Charisma', 'Men follow you, not your money'] };
const OPT_LABEL = {
  patrician: 'Old patrician house', 'plebeian-noble': 'Plebeian nobility', 'italian-new-man': 'New man from Italy', 'provincial-new-man': 'New man from the provinces',
  'rome-rhetoric': 'Rhetoric schools in Rome', 'greek-education': 'Greek education, Athens or Rhodes', estates: 'The family estates', frontier: 'A frontier province',
  mint: 'Mint (tresviri monetales)', courts: 'Courts (decemviri)', police: 'Police (tresviri capitales)', roads: 'Roads (quattuorviri)',
  rhine: 'Tribune on the Rhine', danube: 'Tribune on the Danube', east: 'Tribune in the East under Corbulo', britain: 'Tribune in Britain, Boudicca\'s revolt',
  rome: 'Quaestor in Rome', province: 'Quaestor in a province', court: "Quaestor at Nero's court",
  'lavish-games': 'Aedile who paid for lavish games', 'kept-books': 'Aedile who kept the books', 'tribune-plebs': 'Tribune of the plebs',
  silent: 'Kept silent', informed: 'Informed on others', 'friends-executed': 'Friends were executed', 'unnamed-plotter': 'In the plot, never named',
};
const STAGE_LABEL = { family: 'Family', upbringing: 'Upbringing', 'first-office': 'First office, about 18', tribune: 'Military tribune, about 20', quaestor: 'Quaestor, about 25', aedile: 'Aedile or tribune, about 28', pisonian: 'AD 65: the Pisonian conspiracy' };
const STAT = { opes: 'Wealth', virtus: 'Military', auct: 'Politics', gratia: 'Charisma' };
function effectText(o) {
  const parts = Object.entries(o.d).map(([k, v]) => `${STAT[k]} ${v > 0 ? '+' : ''}${v}`);
  if (o.legit) parts.push(`legitimacy ${o.legit > 0 ? '+' : ''}${o.legit}`);
  if (o.friend) parts.push(`a friend: ${o.friend}`);
  if (o.enemies) parts.push('an enemy');
  if (o.comrades) parts.push(`comrades on the ${o.comrades}`);
  return parts.join(', ') || 'no change';
}
function renderNewGame() {
  $app.innerHTML = `<div class="ng"><h1 class="display" style="color:var(--purple);font-size:24px">A new campaign</h1>
    <h2>Difficulty</h2><div class="grid2" style="grid-template-columns:1fr">${Object.entries(DIFF).map(([k, [t, d]]) => `<button class="pick ${ng.difficulty === k ? 'on' : ''}" data-ng='{"difficulty":"${k}"}'><b>${t}</b><small>${d}</small></button>`).join('')}</div>
    <h2>Your legion's province</h2><div class="grid2">${STARTS.map((id) => `<button class="pick ${ng.start === id ? 'on' : ''}" data-ng='{"start":"${id}"}'><b>${esc(PNAME[id])}</b><small>${START_INFO[id]}</small></button>`).join('')}</div>
    <h2>Your life so far</h2>
    <div class="seg" style="grid-template-columns:1fr 1fr;margin-bottom:8px"><button class="${ng.custom ? '' : 'on'}" data-ng='{"custom":false}'>Quick start</button><button class="${ng.custom ? 'on' : ''}" data-ng='{"custom":true}'>Choose each step</button></div>
    ${ng.custom ? BACKGROUND.map((st) => `<div class="label">${STAGE_LABEL[st.stage]}</div>${st.options.map((o) => `<button class="opt ${ng.bg[st.stage] === o.id ? 'on' : ''}" data-ngbg='${JSON.stringify([st.stage, o.id])}'><b>${OPT_LABEL[o.id] || o.id}</b><em>${effectText(o)}</em></button>`).join('')}`).join('')
      : `<div class="grid2">${Object.entries(ROADS).map(([k, [t, d]]) => `<button class="pick ${ng.road === k ? 'on' : ''}" data-ng='{"road":"${k}"}'><b>${t}</b><small>${d}</small></button>`).join('')}</div><p class="note">A ready-made life that leans this way. Your road is never closed: it is only where you start strongest.</p>`}
    <h2>Your name</h2><input class="name" id="nm" placeholder="Gaius Valerius Corvus" value="${esc(ng.name)}" maxlength="40">
    <button class="btn primary block" data-act="start" style="margin-top:18px;padding:12px">Take up your command</button>
    <button class="btn block" data-act="title">Back</button></div>`;
}

function renderEnd() {
  const o = V.outcome || { win: false, cause: 'death' };
  const text = {
    'held Rome': 'You held Rome. The Senate votes you the powers of Augustus, and the legions swear to your name. History will have to make room.',
    death: 'You fell with your army.', 'army destroyed': 'Your last legion is gone, and you with it.', mutiny: 'Your own legions hailed another man.',
    recalled: 'Your plotting reached Rome before you were ready. The recall came, and recall meant death.',
    'lost your legion': 'Your legion was bought or beaten out from under you before you could make your move. A legate without men is only a man.', 'history passed you by': 'You waited too long. The new emperor remembered your name.',
    'lost the throne': 'Rome fell to another, and you could not take it back.', 'murdered by conspirators': 'The knives came in the palace, as they so often did.', 'out of time': 'The years passed and the war ground on without you deciding it.',
  }[o.cause] || o.cause;
  $app.innerHTML = `<div class="end"><h1>${o.win ? 'Imperator' : 'The end'}</h1><p class="note">${esc(V.month)}</p><p>${esc(text)}</p>
    <div class="card" style="text-align:left"><div class="row">Legions at the end<span>${V.legions.length}</span></div><div class="row">Provinces<span>${V.provinces.filter((p) => p.mine).length}</span></div><div class="row">Legitimacy<span>${V.player.legit}</span></div></div>
    <button class="btn primary block" data-act="new">New campaign</button><button class="btn block" data-act="title">Title</button></div>`;
}

// ---------- the map
function mapScreen() {
  const legendOwners = [...new Map(V.provinces.filter((p) => p.owner !== 'state').map((p) => [p.owner, p])).values()];
  return `<div class="screen mapscreen"><div class="mapwrap" id="mapwrap">
    <div class="zoom"><button data-zoom="1.4">+</button><button data-zoom="0.7">−</button><button data-act="home" title="Your army">◎</button></div>
    <div class="legend">${legendOwners.slice(0, 6).map((p) => `<div><i style="background:${p.color}"></i>${esc(p.owner === 'player' ? 'You' : p.ownerName)}</div>`).join('')}<div><i style="background:#B9BDC3"></i>The Senate</div></div>
  </div></div>${sel ? provinceSheet(sel) : V.act1 ? `<div class="sheet"><div class="sheet-in">${act1Card(true)}</div></div>` : ''}`;
}

function provinceSheet(pid) {
  const p = V.provinces.find((x) => x.id === pid);
  const pl = V.player;
  const army = V.army;
  const myLegsHere = V.legions.filter((l) => l.loc === pid);
  const others = p.legions.filter((l) => l.owner !== 'player');
  const curTax = p.taxes ? p.taxes.find((t) => t.level === p.tax) : null;
  return `<div class="sheet"><div class="sheet-in">
    <div class="bar"><div><h3>${esc(p.name)}</h3><div class="sub">${p.mine ? 'Yours' : esc(p.ownerName === 'the Senate' ? 'Loyal to the Senate' : 'Held by ' + p.ownerName)} · ${p.tier === 'italy' ? 'Italy' : p.tier === 'proc' ? 'procurator\'s district' : p.tier + ' province'}</div></div><button class="x" data-act="close-sheet">×</button></div>
    <div class="body">
      <div class="stats4"><div><b>${curTax ? curTax.rev : p.rev}k</b>revenue</div><div><b>${p.grain}</b>grain</div><div class="${p.unrest > 50 ? 'bad' : ''}"><b>${p.unrest}</b>unrest</div><div class="${p.threat >= 60 ? 'bad' : ''}"><b>${p.threat ?? '–'}</b>${p.frontier ? 'frontier' : 'no frontier'}</div></div>
      ${p.breach ? '<p class="note" style="color:var(--crimson)">The frontier has broken here: no revenue for some months.</p>' : ''}
      ${p.mine ? `
        <div class="tabs">${[['overview', 'Overview'], ['buildings', 'Buildings'], ['forces', 'Forces'], ['governor', 'Governor']].map(([id, l]) => `<button class="${pTab === id ? 'on' : ''}" data-act="ptab" data-ptab="${id}">${l}</button>`).join('')}</div>
        ${pTab === 'overview' ? `
        <div class="label">Taxes</div><div class="seg">${p.taxes.map((t) => `<button class="${p.tax === t.level ? 'on' : ''}" ${A({ type: 'tax', pid, level: t.level })}>${t.level === 'extort' ? 'Extort' : t.level[0].toUpperCase() + t.level.slice(1)}<small>${t.rev}k · ${t.unrest > 0 ? '+' : ''}${t.unrest}</small></button>`).join('')}</div>
        <p class="note">Revenue a month · unrest change a month${p.revMult ? ` · works and governor add ${p.revMult}%` : ''}.</p>
        ${p.grain ? `<div class="label">Grain</div><div class="seg three">${[['ship', 'Ship to Rome'], ['hold', 'Hold'], ['embargo', 'Embargo']].map(([k, l]) => `<button class="${p.grainPolicy === k ? 'on' : ''}" ${A({ type: 'grain', pid, policy: k })}>${l}</button>`).join('')}</div><p class="note">Shipping sells grain to whoever rules Rome. An embargo starves him.</p>` : ''}
        <div class="label">The people</div>
        <button class="btn block" ${A({ type: 'games', pid })} ${p.games ? 'disabled' : ''}>${p.games ? 'Games given this month' : `Give games · ${p.gamesCost}k · unrest falls sharply`}</button>
        ` : pTab === 'buildings' ? `
        <div class="label">Works · ${p.buildings.length + (p.building ? 1 : 0)} of ${p.slots} sites</div>
        <div class="slots">${Array.from({ length: p.slots }, (_, i) => { const b = p.buildings[i]; if (b) return `<div class="slot built" title="${esc(b.does)}"><svg viewBox="0 0 8 8">${ICON8[b.id] || ''}</svg>${esc(b.name)}</div>`; if (i === p.buildings.length && p.building) return `<div class="slot building"><svg viewBox="0 0 8 8">${ICON8[p.building.id] || ''}</svg>${esc(p.building.name)}<br><small>ready ${esc(p.building.done)}</small></div>`; return '<div class="slot">Empty site</div>'; }).join('')}</div>
        ${p.works.filter((w) => !w.built).map((w) => `<button class="opt" ${A({ type: 'build', pid, building: w.id })} ${w.why ? 'disabled' : ''}><b>${esc(w.name)} <span>${w.cost}k · ${w.months} month${w.months === 1 ? '' : 's'} · ${w.upkeep}k a month</span></b><em>${esc(w.why || w.does)}</em></button>`).join('')}
        ` : pTab === 'forces' ? `
        ${myLegsHere.length ? myLegsHere.map((l) => `<div class="row"><div>${esc(l.name)}<small>${n(l.men)} men · loyalty ${l.loyalty}${l.army ? ' · with the army' : ' · stationed here'}</small></div><button class="btn small" ${A({ type: 'garrison', legionId: l.id, on: !l.garrison })}>${l.garrison ? 'Join the army' : 'Garrison here'}</button></div>`).join('') : '<p class="note">No legion stationed here.</p>'}
        <div class="row">Auxiliary garrison<span>${n(p.aux)} men</span></div>
        <button class="btn block" ${A({ type: 'levy', pid })} ${p.canLevy ? '' : 'disabled'}>Raise a legion here · ${p.levyCost}k, ${p.levyMonths} months</button>
        ${pl.levy ? `<p class="note">A legion is being raised in ${esc(PNAME[pl.levy.at])}: ready ${esc(pl.levy.done)}.</p>` : ''}
        ` : `
        ${p.governor ? `<div class="card gold"><h3>${esc(p.governor.name)} <small>${esc(p.governor.trait)}${p.governor.friend ? ' · your friend' : ''}</small></h3><p class="note">${esc(p.governor.does)}</p></div>` : '<p class="note">No governor: a deputy keeps the books, and nothing more.</p>'}
        <div class="label">Men who would take the post</div>
        ${p.candidates.map((c) => `<button class="opt ${p.governor && p.governor.name === c.name ? 'on' : ''}" ${A({ type: 'governor', pid, index: c.index })}><b>${esc(c.name)} <span>${esc(c.trait)}${c.friend ? ' · a friend from your past' : ''}</span></b><em>${esc(c.does)}</em></button>`).join('')}
        `}
      ` : `
        <div class="label">Who is here</div>
        <div class="row">Garrison<span>${n(p.aux)} auxiliaries</span></div>
        <div class="row">Walled towns<span>${p.towns}</span></div>
        ${others.map((l) => `<div class="row">${esc(l.name)}<span class="pill">${n(l.men)} men</span></div>`).join('')}
        <div class="btns">
          ${army && army.loc !== pid ? `<button class="btn primary" ${A({ type: 'march', dest: pid })}>March here</button>` : ''}
          ${p.canLetter ? `<button class="btn" ${A({ type: 'letter', pid })} ${pl.letters > 0 ? '' : 'disabled'}>Write to the governor · 20k${pl.letters > 0 ? '' : ' (no envoy left)'}</button>` : ''}
        </div>
        ${!pl.ownsProvince ? '<p class="note">Win your own province first (Army tab).</p>' : ''}
      `}
    </div></div></div>`;
}

// ---------- realm
function realmScreen() {
  const mine = V.provinces.filter((p) => p.mine);
  const income = V.player.income, pay = V.player.pay;
  return `<div class="screen"><h2 class="sec">Your provinces</h2>
    <div class="card"><div class="row">Revenue a month<span>${n(income)}k</span></div><div class="row">Pay a month<span>${n(pay)}k</span></div><div class="row"><b>Balance</b><b style="color:${income - pay < 0 ? 'var(--crimson)' : 'inherit'}">${income - pay >= 0 ? '+' : ''}${n(income - pay)}k</b></div></div>
    ${mine.length ? `<div class="label">Set every province's taxes</div><div class="seg">${['light', 'normal', 'heavy', 'extort'].map((t) => `<button ${A({ type: 'taxAll', level: t })}>${t === 'extort' ? 'Extort' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>` : '<p class="note">You hold no province yet.</p>'}
    ${mine.map((p) => `<div class="card" data-sel="${p.id}"><h3>${esc(p.name)} <small>${p.tax} taxes</small></h3><div class="row">Revenue<span>${p.taxes.find((t) => t.level === p.tax).rev}k</span></div><div class="row">Unrest<span class="pill ${p.unrest > 50 ? 'bad' : ''}">${p.unrest}</span></div>${p.frontier ? `<div class="row">Frontier threat<span class="pill ${p.threat >= 60 ? 'bad' : ''}">${p.threat}</span></div>` : ''}</div>`).join('')}
    <h2 class="sec">Neighbours you can write to</h2>
    ${V.provinces.filter((p) => p.canLetter).map((p) => `<div class="row"><div>${esc(p.name)}<small>governor loyal to the Senate</small></div><button class="btn small" ${A({ type: 'letter', pid: p.id })} ${V.player.letters > 0 ? '' : 'disabled'}>Letter · 20k</button></div>`).join('') || '<p class="note">None: write to neutral governors next to your provinces, once you hold one.</p>'}
  </div>`;
}

// ---------- army
function legionRow(l) {
  return `<div class="row"><div style="flex:1">${esc(l.name)} ${l.client ? '<span class="pill">client</span>' : l.levy ? '<span class="pill">new</span>' : ''}${l.bought ? ' <span class="pill">bought</span>' : ''}
    <small>${n(l.men)} men · pay ${l.pay}k${l.debt ? ` · owed ${l.debt}k${l.overdue ? ' (overdue)' : ''}` : ''}</small>
    <div class="meter ${l.loyalty < 30 ? 'red' : ''}" style="margin-top:3px"><i style="width:${l.loyalty}%"></i></div></div>
    <button class="btn small" ${A({ type: 'garrison', legionId: l.id, on: !l.garrison })}>${l.garrison ? 'Join' : 'Garrison'}</button></div>`;
}
function act1Card(compact) {
  const a = V.act1;
  if (!a) return '';
  return `<div class="bar"><div><h3>Act I · ${esc(a.provName)}</h3><div class="sub">${a.share}% of the legionaries here are yours · three-quarters wins the governor</div></div></div>
    <div class="body">
      <div class="label">Suspicion</div><div class="meter red"><i style="width:${a.suspicion}%"></i></div>
      <p class="note">At 100 Rome recalls you. Buying and talking raise it a little; fighting in the camp raises it a lot. It cools by itself.</p>
      ${a.neroLives ? '<p class="note"><b>Nero still lives.</b> Men hold to their oath: every approach is harder and dearer until the news of his fall (June 68). Waiting is a choice.</p>' : ''}
      ${a.approached ? '<p class="note"><b>You have made this month\'s approach.</b> End the month.</p>' : a.bodies.slice(0, compact ? 1 : 9).map((b) => bodyCard(b, (opt) => ({ type: 'approach', key: b.key, option: opt }), true)).join('')}
      ${compact && !a.approached && a.bodies.length > 1 ? '<p class="note">More in the Army tab.</p>' : ''}
    </div>`;
}
const EMBLEM = {
  legion: '<rect x="3" y="0" width="2" height="8" fill="#2B2826"/><rect x="1" y="1" width="6" height="1" fill="#C9A227"/><rect x="2" y="0" width="4" height="1" fill="#E8D48A"/><rect x="2" y="3" width="4" height="3" fill="#C8102E"/>',
  army: '<rect x="1" y="0" width="1" height="8" fill="#2B2826"/><rect x="5" y="0" width="1" height="8" fill="#2B2826"/><rect x="2" y="1" width="2" height="2" fill="#C8102E"/><rect x="6" y="1" width="2" height="2" fill="#C8102E"/><rect x="0" y="5" width="8" height="3" fill="#6C6762"/>',
  aux: '<rect x="1" y="2" width="6" height="6" fill="#B9A981"/><rect x="2" y="4" width="4" height="4" fill="#6C6762"/><rect x="3" y="0" width="2" height="2" fill="#2B2826"/>',
  town: '<rect x="0" y="3" width="8" height="5" fill="#B9BDC3"/><rect x="0" y="2" width="1" height="1" fill="#B9BDC3"/><rect x="2" y="2" width="1" height="1" fill="#B9BDC3"/><rect x="5" y="2" width="1" height="1" fill="#B9BDC3"/><rect x="7" y="2" width="1" height="1" fill="#B9BDC3"/><rect x="3" y="5" width="2" height="3" fill="#2B2826"/>',
  raid: '<rect x="1" y="1" width="2" height="6" fill="#6C6762"/><rect x="4" y="2" width="3" height="4" fill="#8C1C2B"/>',
};
const KIND_WORD = { legion: 'A legion', army: 'An army', aux: 'A garrison of auxiliaries', town: 'A walled town', raid: 'Raiders' };
function bodyCard(b, mk, noBypass) {
  const facts = [
    b.men ? `${n(b.men)} men` : null,
    b.loyalty != null ? `loyal to ${b.ownerName === 'you' ? 'you' : esc(b.ownerName || 'the Senate')} (${b.loyalty})` : b.ownerName ? `holds for ${esc(b.ownerName)}` : null,
  ].filter(Boolean);
  return `<div class="card gold enc"><div class="enc-head"><svg viewBox="0 0 8 8" class="emb">${EMBLEM[b.kind] || ''}</svg><div><h3>${esc(b.who)}</h3><div class="note">${KIND_WORD[b.kind] || ''}${facts.length ? ' · ' + facts.join(' · ') : ''}</div></div></div>
    ${b.comrades ? '<p class="note good-note">You served with this legion as a tribune. Old comrades listen.</p>' : ''}
    ${b.options.filter((o) => !(noBypass && o.id === 'bypass')).map((o) => `<button class="opt" data-choice ${A(mk(o.id))} ${o.ok ? '' : 'disabled'}><b>${esc(o.label)} <span>${esc(o.cost)}</span></b>${o.ok ? `<em>${esc(OPT_HINT[o.id] || '')}</em>` : `<em>${esc(o.why)}</em>`}</button>`).join('')}
  </div>`;
}
const OPT_HINT = {
  buy: 'Bought men stay bought while the money lasts.',
  promise: 'A debt: unpaid past its day, they turn sour.',
  negotiate: 'Costs nothing but a little standing if refused; they may simply stand aside.',
  fight: 'Men lost now take months to replace.',
  bypass: 'Faster, but every enemy left behind threatens your supply.',
};
function armyScreen() {
  if (V.act1) return `<div class="screen"><div class="card" style="padding:0;overflow:hidden">${act1Card(false)}</div>${V.legions.map(legionRow).join('')}</div>`;
  const ar = V.army, p = V.player;
  const garrisons = V.legions.filter((l) => !l.army);
  const due = V.legions.filter((l) => l.debt > 0);
  return `<div class="screen">
    ${p.canAcclaim ? `<div class="card gold"><h3>Be proclaimed imperator</h3><p class="note">Your legions will hail you. Every rival will treat you as one, and the promises you made fall due sooner. Legitimacy +10.</p><button class="btn purple block" data-act="acclaim">Let them hail you</button></div>` : ''}
    <h2 class="sec">Your army</h2>
    ${ar ? `<div class="card"><div class="row">At<span>${esc(PNAME[ar.loc])}</span></div><div class="row">Marching to<span>${ar.dest && ar.dest !== ar.loc ? esc(PNAME[ar.dest]) + ` · ${ar.path.length} stage${ar.path.length === 1 ? '' : 's'}` : 'Encamped'}</span></div><div class="row">Strength<span>${ar.power}k</span></div>
      ${ar.halted ? '<p class="note" style="color:var(--crimson)">Facing an enemy: decide below.</p>' : ''}
      <p class="note">Tap a province on the map and choose <b>March here</b>.</p>${ar.dest ? `<button class="btn small" data-a='{"type":"halt"}'>Halt</button>` : ''}</div>
      ${ar.legions.map(legionRow).join('')}` : '<p class="note">No army in the field.</p>'}
    ${V.pending.map((pd) => `<h2 class="sec">At ${esc(pd.provName)}</h2>${pd.bodies.map((b) => bodyCard(b, (opt) => ({ type: 'encounter', pendingId: pd.id, key: b.key, option: opt }))).join('')}<button class="btn block" ${A({ type: 'encounter', pendingId: pd.id, option: 'withdraw' })}>Fall back</button>`).join('')}
    ${garrisons.length ? `<h2 class="sec">Garrisons</h2>${garrisons.map(legionRow).join('')}` : ''}
    ${due.length ? `<h2 class="sec">Promises</h2><p class="note">Unpaid promises past their day cost loyalty every month.</p>${due.map((l) => `<div class="row"><div>${esc(l.name)}<small>${l.debt}k${l.overdue ? ' · overdue' : ''}</small></div><button class="btn small" ${A({ type: 'pay', legionId: l.id })}>Pay</button></div>`).join('')}<button class="btn block" data-a='{"type":"pay"}'>Pay everything due</button>` : ''}
  </div>`;
}

// ---------- diplomacy
const KIND = { hist: 'Claimant', minor: 'Rebel', proc: 'Usurper' };
function diplomacyScreen() {
  const p = V.player;
  const alive = V.factions.filter((f) => f.alive);
  const strongest = [...alive].sort((a, b) => b.strength - a.strength);
  return `<div class="screen">
    ${V.offers.length ? `<h2 class="sec">Offers</h2>${V.offers.map((o) => `<div class="card gold"><h3>${esc(o.fromName)}</h3><p class="note">${o.type === 'submission' ? 'offers to submit to you, with his legions and provinces, for an office you will owe him.' : o.type === 'alliance' ? `proposes an alliance against ${esc(o.targetName)}.` : `proposes a truce for ${o.months} months.`}</p><div class="btns"><button class="btn primary" data-choice ${A({ type: 'answer', offerId: o.id, accept: true })}>Accept</button><button class="btn" data-choice ${A({ type: 'answer', offerId: o.id, accept: false })}>Decline</button></div></div>`).join('')}` : ''}
    <h2 class="sec">Rivals</h2><p class="note">Envoys left this month: ${p.envoys}. A proposal shows how he is likely to take it, and why.</p>
    ${strongest.map((f) => `<div class="card"><h3><span><i class="chip" style="background:${f.color}"></i>${esc(f.name)}</span><small>${KIND[f.kind] || ''}${f.acclaimed ? ' · proclaimed' : ''}</small></h3>
      <div class="row">Legions · provinces<span>${f.legions} · ${f.provinces}</span></div>
      <div class="row">His standing with you<span class="pill ${f.standing >= 30 ? 'good' : f.standing <= -30 ? 'bad' : ''}">${f.standing}</span></div>
      <div class="row">Distance<span>${f.distance != null ? f.distance + ' months' : '–'}</span></div>
      ${f.treaty ? `<div class="row">Treaty<span class="pill good">${f.treaty.type}${f.treaty.until ? ' to ' + esc(monthOf(f.treaty.until)) : ''}</span></div>` : ''}
      <div class="btns">
        ${f.treaty ? `<button class="btn small" ${A({ type: 'breakTreaty', treatyId: f.treaty.id })}>Break the treaty</button>` : `<button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'truce', months: 12 })} ${p.envoys > 0 ? '' : 'disabled'}>Truce · ${f.truce.ok ? 'likely' : 'unlikely'}</button>`}
        <button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'submission' })} ${p.envoys > 0 ? '' : 'disabled'}>Demand submission · ${f.submission.ok ? 'likely' : 'unlikely'}</button>
        <button class="btn small" ${A({ type: 'gift', to: f.id, amount: 60 })}>Gift · 60k</button>
      </div>
      ${!f.treaty ? `<p class="note">${esc([...f.truce.reasons].slice(0, 2).join('; ') || ' ')}</p>` : ''}
      ${!f.treaty && strongest.filter((g) => g.id !== f.id).length ? `<div class="btns">${strongest.filter((g) => g.id !== f.id).slice(0, 2).map((g) => `<button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'alliance', target: g.id })} ${p.envoys > 0 ? '' : 'disabled'}>Ally against ${esc(g.name.split(' ').slice(-1)[0])}</button>`).join('')}</div>` : ''}
    </div>`).join('') || '<p class="note">No rival claimant has risen yet.</p>'}
    <h2 class="sec">The Senate</h2>
    <div class="card"><p class="note">A decree naming you legate of the Senate and People, as Galba styled himself: legitimacy +8, and easier recognition later.</p><button class="btn block" data-act="decree" ${p.decree ? 'disabled' : ''}>${p.decree ? 'Granted' : `Ask for the decree · ${p.decreeCost}k`}</button></div>
    <h2 class="sec">Kings and foreign powers</h2>
    ${V.clients.map((c) => `<div class="row"><div>${esc(c.name)}<small>${n(c.men)} men · ${c.cost}k${c.parthian ? ' · Romans will not forgive Parthians in Italy: legitimacy −15' : ''}${c.why ? ' · ' + esc(c.why) : ''}</small></div><button class="btn small" ${A({ type: 'client', client: c.id })} ${c.why ? 'disabled' : ''}>Ask</button></div>`).join('')}
    <h2 class="sec">Gold among their legions</h2><p class="note">A legion far from its general can be turned. If you are found out, its master will not forget.</p>
    ${V.subvertable.map((l) => `<div class="row"><div>${esc(l.name)}<small>${esc(l.owner)} · ${esc(PNAME[l.loc])} · loyalty ${l.loyalty}</small></div><button class="btn small" ${A({ type: 'subvert', legionId: l.id })} ${l.ok ? '' : 'disabled'}>${l.cost}k</button></div>`).join('') || '<p class="note">No rival legion stands apart from its general.</p>'}
  </div>`;
}
function monthOf(t) { const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${M[(2 + t) % 12]} ${68 + Math.floor((2 + t) / 12)}`; }

// ---------- Rome
function romeScreen() {
  const r = V.rome;
  return `<div class="screen"><h2 class="sec">Rome</h2>
    <div class="card"><div class="row">Emperor<span>${esc(r.youRule ? 'You' : r.emperor)}</span></div><div class="row">Rome held by<span>${esc(r.holder === 'you' ? 'You' : r.holder)}</span></div>
    ${r.youRule ? `<div class="row">Months held<span>${r.hold} of ${r.holdTarget}</span></div><div class="meter purple"><i style="width:${(100 * r.hold) / r.holdTarget}%"></i></div>` : ''}</div>
    ${r.youRule ? `<div class="card gold"><h3>Whispers</h3><div class="meter red"><i style="width:${Math.min(100, r.whispers * 4)}%"></i></div>
      ${r.plotWarned ? `<p class="note" style="color:var(--crimson)"><b>A plot will be tried next month.</b> ${r.informersPaid ? 'Your informers are at work.' : 'Pay informers now and they may uncover it in time.'}</p>` : ''}
      <p class="note">${r.whispers >= 15 ? 'Names are spoken in the Praetorian camp.' : r.whispers >= 5 ? 'There is talk in the Senate. Keep your friends close.' : 'Rome is quiet, for now.'} Low legitimacy and an angry city feed the whispers; legions in Italy and your own strengths quiet them.</p></div>
      <div class="card"><div class="row">The crowd<span class="pill ${r.unrest > 60 ? 'bad' : ''}">${r.unrest}</span></div><div class="row">Grain<span>${r.grain} of ${r.grainNeed}</span></div>${r.praetorians ? `<div class="row">Praetorians<span>loyalty ${r.praetorians.loyalty}${r.praetorians.debt ? ` · owed ${r.praetorians.debt}k` : ''}</span></div>` : ''}</div>
      <div class="label">Spend</div>
      ${[['dole', 'Grain dole · 150k', 'The crowd calms.'], ['senators', 'Buy senators · 200k', 'Legitimacy +4.'], ['consulships', 'Consulships for friends · 80k', 'Legitimacy +2.'], ['games', 'Games and largesse · 100k', 'Legitimacy +2; the crowd calms.'], ['informers', 'Pay informers · 120k', 'They may uncover a plot before it strikes.']].map(([k, l, d]) => `<button class="opt" ${A({ type: 'rome', spend: k })}><b>${l}</b><em>${d}</em></button>`).join('')}`
      : '<p class="note">Take Rome, with no enemy legions in Rome, Etruria or Campania, and the Senate will recognise you if your legitimacy is 25 or more, or if five of your legions stand in Italy.</p>'}
  </div>`;
}

function dispatchScreen() {
  return `<div class="screen"><h2 class="sec">Dispatches</h2><p class="note">News travels at the speed of a horse. Reports from far provinces arrive weeks late.</p>
    ${V.dispatches.map((d) => `<div class="disp"><small>${esc(d.when)}${d.late ? ' · reached you late' : ''}${d.loc ? ' · ' + esc(PNAME[d.loc]) : ''}</small><div>${esc(d.text)}</div></div>`).join('') || '<p class="note">Nothing yet.</p>'}</div>`;
}

function legateScreen() {
  const p = V.player;
  return `<div class="screen"><h2 class="sec">${esc(p.name)}</h2>
    <div class="card">${Object.entries(STAT).map(([k, l]) => `<div class="row">${l}<span style="flex:0 0 55%"><div class="meter"><i style="width:${(p.stats[k] / 7) * 100}%"></i></div></span><b>${p.stats[k]}</b></div>`).join('')}</div>
    <p class="note">Your strongest road: <b>${esc(ROADS[p.road][0])}</b>. ${esc(ROADS[p.road][1])}.${p.comrades ? ` You served as a tribune on the ${esc(p.comrades)}: those legions remember you.` : ''}</p>
    <div class="card"><div class="row">Legitimacy<span>${p.legit}</span></div><div class="row">Proclaimed<span>${p.acclaimed ? 'Yes' : 'No'}</span></div><div class="row">Borrowed<span>${n(p.borrowed)}k</span></div><div class="row">Difficulty<span>${esc(DIFF[V.difficulty][0])}</span></div></div>
    <h2 class="sec">Save</h2><p class="note">The game saves itself every month in this browser. A save code moves it to another device.</p>
    <button class="btn block" data-act="export">Make a save code</button><textarea class="code" id="exp" readonly placeholder="Your code appears here"></textarea>
    <button class="btn block" data-act="title">Title screen</button>
    <button class="btn block" data-act="abandon" style="color:var(--crimson)">Abandon this campaign</button></div>`;
}

// ---------- modal: encounters and offers wait for you after the month
function modal() {
  if (modalOff === V.turn) return '';
  if (V.pending.length && tab !== 'army') {
    const pd = V.pending[0];
    const b = pd.bodies[0];
    if (!b) return '';
    return `<div class="modal"><div class="modal-in"><div class="bar"><div><h3>${esc(pd.provName)}</h3><div class="sub">Your army meets ${pd.bodies.length > 1 ? pd.bodies.length + ' bodies of men' : 'resistance'}. Strength ${pd.power}k.</div></div><button class="x" data-act="close">×</button></div>
      <div class="body">${bodyCard(b, (opt) => ({ type: 'encounter', pendingId: pd.id, key: b.key, option: opt }))}<button class="btn block" data-choice ${A({ type: 'encounter', pendingId: pd.id, option: 'withdraw' })}>Fall back</button></div></div></div>`;
  }
  if (V.offers.length && tab !== 'diplomacy') {
    const o = V.offers[0];
    return `<div class="modal"><div class="modal-in"><div class="bar"><div><h3>An envoy from ${esc(o.fromName)}</h3></div><button class="x" data-act="close">×</button></div><div class="body">
      <p>${o.type === 'submission' ? 'He offers to submit to you, with his legions and provinces, for an office you will owe him.' : o.type === 'alliance' ? `He proposes an alliance against ${esc(o.targetName)}.` : `He proposes a truce for ${o.months} months.`}</p>
      <div class="btns"><button class="btn primary" data-choice ${A({ type: 'answer', offerId: o.id, accept: true })}>Accept</button><button class="btn" data-choice ${A({ type: 'answer', offerId: o.id, accept: false })}>Decline</button></div></div></div></div>`;
  }
  return '';
}

// ---------- events
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-a],[data-act],[data-tab],[data-ng],[data-ngbg],[data-sel],[data-zoom]');
  if (!t) return;
  if (t.dataset.a) { doAct(JSON.parse(t.dataset.a)); return; }
  if (t.dataset.tab) { tab = t.dataset.tab; if (tab !== 'map') sel = null; render(); return; }
  if (t.dataset.sel) { sel = t.dataset.sel; tab = 'map'; render(); map.focus(sel, 5); return; }
  if (t.dataset.zoom) { map.zoomAt(map.cw / 2, map.ch / 2, Number(t.dataset.zoom)); return; }
  if (t.dataset.ng) { Object.assign(ng, JSON.parse(t.dataset.ng)); ng.name = document.getElementById('nm')?.value || ng.name; renderNewGame(); return; }
  if (t.dataset.ngbg) { const [st, id] = JSON.parse(t.dataset.ngbg); ng.bg[st] = id; ng.name = document.getElementById('nm')?.value || ng.name; renderNewGame(); return; }
  const a = t.dataset.act;
  if (a === 'new') { screen = 'newgame'; renderNewGame(); }
  else if (a === 'title') { screen = 'title'; renderTitle(); }
  else if (a === 'start') {
    const name = document.getElementById('nm')?.value.trim();
    const qs = new URLSearchParams(location.search);
    S = newGame({ seed: Number(qs.get('seed')) || (Date.now() ^ (Math.random() * 1e9)) >>> 0, difficulty: ng.difficulty, start: ng.start, road: ng.road, background: ng.custom ? ng.bg : undefined, name: name || 'Gaius Valerius Corvus' });
    screen = 'game'; tab = V?.act1 ? 'army' : 'map'; sel = null; modalOff = -1; refresh(); tab = 'map'; render(); map.z = 0; map.resize(); map.focus(ng.start, 5);
  } else if (a === 'continue') { S = loadSaved(); if (S) { screen = 'game'; tab = 'map'; refresh(); map.z = 0; map.resize(); map.focus(S.factions.player.leaderArmy && S.armies[S.factions.player.leaderArmy] ? S.armies[S.factions.player.leaderArmy].loc : S.factions.player.base, 5); } }
  else if (a === 'end-turn') doAct({ type: 'endMonth' });
  else if (a === 'bedriacum') { S = bedriacum({ seed: (Date.now() % 100000) + 1 }); screen = 'game'; tab = 'map'; bChip = 'sector:1'; bSel = null; refresh(); }
  else if (a === 'bchip') { bChip = t.dataset.chip; render(); }
  else if (a === 'ptab') { pTab = t.dataset.ptab; render(); }
  else if (a === 'acclaim') doAct({ type: 'acclaim' });
  else if (a === 'decree') doAct({ type: 'decree' });
  else if (a === 'close') { modalOff = V.turn; render(); }
  else if (a === 'close-sheet') { sel = null; render(); }
  else if (a === 'home') { const ar = V.army; map.focus(ar ? ar.loc : V.player.base, 5); }
  else if (a === 'export') { const code = await exportCode(); const el = document.getElementById('exp'); if (el) { el.value = code; el.select(); } try { await navigator.clipboard.writeText(code); toast('Copied to the clipboard.', 'good'); } catch { toast('Select the code and copy it.'); } }
  else if (a === 'import') { try { S = await importCode(document.getElementById('imp').value); screen = 'game'; tab = 'map'; refresh(); map.z = 0; map.resize(); } catch (err) { toast(err.message, 'bad'); } }
  else if (a === 'abandon') {
    // no confirm() dialogs in embedded pages: a second tap confirms
    if (t.dataset.armed) { lsDel(SAVE_KEY); S = null; screen = 'title'; renderTitle(); }
    else { t.dataset.armed = '1'; t.textContent = 'Tap again to abandon. This cannot be undone.'; }
  }
});

registerSW(() => {
  const bar = document.createElement('div'); bar.className = 'update'; bar.innerHTML = 'A new version is ready. <u>Reload</u>';
  bar.onclick = () => location.reload(); document.body.appendChild(bar);
});
renderTitle();


// ---------- the field
const STATE_WORD = { fresh: 'fresh', engaged: 'fighting', tired: 'resting', wavering: 'wavering', routed: 'routed', reserve: 'in reserve' };
function renderBattle() {
  const b = V.battle;
  const animate = b.round !== bRoundSeen;
  bRoundSeen = b.round;
  const tod = b.night ? 'night' : b.round >= b.rounds - 1 ? 'dusk' : b.round <= 1 ? 'morning' : b.round <= 3 ? 'midday' : 'afternoon';
  const [kind, arg] = bChip.split(':');
  const chips = [
    ...b.sectors.map((sc) => [`sector:${sc.col}`, sc.label, sc.routed ? 'broken' : sc.order]),
    ['reserve', 'Reserve', b.reserve.used ? 'committed' : b.reserve.order == null ? 'held back' : 'to ' + ['left', 'centre', 'right'][b.reserve.order]],
    ...b.cavalry.map((c) => [`cav:${c.pos}`, c.col === 'left' ? 'Horse left' : 'Horse right', c.order]),
    ['legate', 'You', { stay: 'with the eagles', ride: 'riding', rally: 'rallying', appeal: 'appealing', ruse: 'ruse' }[b.legate.action]],
  ];
  let panel = '';
  if (kind === 'sector') {
    const sc = b.sectors[+arg];
    panel = `<div class="bstat"><div><b>Your line</b> ${n(sc.mine.men)} men · ${sc.linesLeft + 1} line${sc.linesLeft ? 's' : ''} deep · ${sc.reliefs} relief${sc.reliefs === 1 ? '' : 's'} left${sc.mine.pila >= 0.5 ? ` · pila ${sc.mine.pila}` : ' · pila spent'}
      <div class="mrow2">Morale<div class="meter"><i style="width:${sc.mine.morale}%"></i></div></div><div class="mrow2">Endurance<div class="meter purple"><i style="width:${sc.mine.end}%"></i></div></div></div>
      <div><b>Their line</b> about ${n(sc.theirs.men)} men · ${sc.theirs.state} · ${sc.theirs.shaken}${sc.theirs.lastOrder ? ` · last: ${sc.theirs.lastOrder}` : ''}</div>
      <div class="note">${['Locked shield to shield', 'Within a javelin’s throw', 'Far apart'][sc.dist]}</div></div>
      <div class="orders">${sc.orders.map((o) => `<button class="${sc.order === o.id ? 'on' : ''}" ${A({ type: 'battleOrder', sector: b.fromScreen[sc.col], order: o.id })} ${o.why ? 'disabled' : ''}>${o.label}<small>${esc(o.why || o.does)}</small></button>`).join('')}</div>`;
  } else if (kind === 'reserve') {
    panel = `<p class="note">${b.reserve.used ? 'Your reserve is committed.' : `${b.reserve.count} fresh cohorts wait behind the centre. Once committed, they march up behind a sector as its next line.`}</p>
      <div class="orders">${[null, 0, 1, 2].map((col) => `<button class="${b.reserve.order === col ? 'on' : ''}" ${A({ type: 'battleReserve', sector: col == null ? null : b.fromScreen[col] })} ${b.reserve.used ? 'disabled' : ''}>${col == null ? 'Hold back' : 'Commit ' + ['left', 'centre', 'right'][col]}<small>${col == null ? 'Keep them' : 'Once only'}</small></button>`).join('')}</div>`;
  } else if (kind === 'cav') {
    const c = b.cavalry.find((x) => String(x.pos) === arg);
    const theirs = b.enemyCavalry.find((x) => x.col === c.col);
    panel = `<p class="note">${n(c.men)} horse · ${c.end < 30 ? 'blown' : c.end < 60 ? 'tiring' : 'fresh'}${c.beaten ? ' · beaten back' : ''}. Facing about ${n(theirs.men)} of theirs${theirs.beaten ? ', beaten back' : ''}.</p>
      <div class="orders">${[['screen', 'Screen the flank', 'Stops their horse'], ['charge', 'Charge the flank', 'Through their horse, into their line'], ['pursue', 'Pursue', c.canPursue ? 'Cut down the fugitives' : 'Nobody is running yet']].map(([o, l, d]) => `<button class="${c.order === o ? 'on' : ''}" ${A({ type: 'battleCav', pos: c.pos, order: o })} ${o === 'pursue' && !c.canPursue ? 'disabled' : ''}>${l}<small>${d}</small></button>`).join('')}</div>`;
  } else {
    const L = b.legate;
    const routedCols = b.sectors.filter((x) => x.routed).map((x) => x.col);
    const opts = [['stay', null, 'Stay with the eagles', 'Safe'], ...[0, 1, 2].map((c) => ['ride', c, `Ride to the ${['left', 'centre', 'right'][c]}`, 'Morale there; some risk']),
      ...routedCols.map((c) => ['rally', c, `Rally the ${['left', 'centre', 'right'][c]}`, L.rallyUsed ? 'Already used' : 'Once per battle']),
      ...[0, 1, 2].filter((c) => b.sectors[c].dist === 0).map((c) => ['appeal', c, `Call across the lines (${['left', 'centre', 'right'][c]})`, `Charisma ${L.gratia}; better at night`]),
      ...(L.ruseUsed ? [] : [0, 1, 2].map((c) => ['ruse', c, `Signal a ruse (${['left', 'centre', 'right'][c]})`, 'Next round that line feigns retreat']))];
    panel = `<div class="orders two">${opts.map(([a, c, l, d]) => `<button class="${L.action === a && (c == null || L.target === c) ? 'on' : ''}" ${A({ type: 'battleLegate', action: a, target: c == null ? 1 : b.fromScreen[c] })}>${l}<small>${d}</small></button>`).join('')}</div>`;
  }
  const coh = bSel && b.cohorts.find((c) => c.id === bSel);
  const cohCard = coh ? `<div class="card gold ccard"><h3>${coh.mine ? '' : 'Enemy: '}${esc(coh.name)} <small>cohort ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][coh.n - 1] || coh.n}${coh.depth >= 0 && coh.depth < 9 ? ' · line ' + (coh.depth + 1) : ''}</small></h3>
    ${coh.mine ? `<div class="mrow2">Men<div class="meter red"><i style="width:${(100 * coh.men) / coh.max}%"></i></div><b>${coh.men}/${coh.max}</b></div><div class="mrow2">Morale<div class="meter"><i style="width:${coh.morale}%"></i></div><b>${coh.morale}</b></div><div class="mrow2">Endurance<div class="meter purple"><i style="width:${coh.end}%"></i></div><b>${coh.end}</b></div><div class="note">Pila ${coh.pila} · ${STATE_WORD[coh.state] || coh.state}</div>`
      : `<div class="note">About ${n(Math.round(coh.men / 50) * 50)} men · ${coh.end >= 70 ? 'fresh' : coh.end >= 35 ? 'tiring' : 'spent'} · ${coh.morale >= 60 ? 'steady' : coh.morale >= 35 ? 'shaken' : 'wavering'}</div>`}</div>` : '';
  const result = b.over ? `<div class="card gold"><h3>${{ won: 'Victory', lost: 'Defeat', draw: 'Neither army broke' }[b.result]}</h3><p class="note">${b.result === 'won' ? 'Their army breaks and runs. Some of their legions will come over to you.' : b.result === 'lost' ? 'Your army breaks. What is left falls back.' : 'Both armies draw off in the dark.'}</p><button class="btn primary block" data-a='{"type":"battleRound"}'>Return to the campaign</button></div>` : '';
  const controls = b.over ? '' : b.dusk
    ? `<div class="btns"><button class="btn primary" data-a='{"type":"battleDusk","fightOn":true}'>Fight on into the night</button><button class="btn" data-a='{"type":"battleDusk","fightOn":false}'>Break off</button></div><p class="note">At night everything is less certain, and men can hear each other across the lines.</p>`
    : `<button class="btn primary block trumpets" data-a='{"type":"battleRound"}'>Sound the trumpets</button><button class="btn block" data-a='{"type":"battleAuto"}'>Leave it to the legates</button>`;
  $app.innerHTML = hud() + `<div class="battle"><div class="bar"><div><h3>Battle near ${esc(b.locName)}</h3><div class="sub">${b.attacking ? 'You attack' : 'You are attacked'} · round ${Math.min(b.round + 1, b.maxRounds)} of ${b.rounds}${b.night ? ' (night)' : ''} · ${tod}</div></div></div>
    <div id="fieldwrap"></div>
    <div class="bbody">
      <p class="note"><b>${esc(b.enemy)}</b>. ${esc(b.enemyGeneralText)}</p>
      ${result}
      ${b.over ? '' : `<div class="chips">${chips.map(([id, l, o]) => `<button class="bchip ${bChip === id ? 'on' : ''}" data-act="bchip" data-chip="${id}">${l} <em>${esc(o)}</em></button>`).join('')}</div>${panel}`}
      ${cohCard}
      ${b.log.length ? `<div class="blog">${b.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : ''}
      ${controls}
    </div></div>`;
  field.attach(document.getElementById('fieldwrap'));
  field.update(b, bSel, animate);
}
