// The UI: renders view(state) and sends actions. It computes nothing itself.
import { newGame, bedriacum } from '../engine/turn.js';
import { FieldView } from './field.js';
import { act } from '../engine/actions.js';
import { SERVED } from '../engine/story.js';
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
let tab = 'map', sel = null, modalOff = -1, toastT = null, pTab = 'overview', eventLater = -1, dTab = 'rivals';
const ng = { difficulty: 'centurion', start: 'GSU', road: 'politics', custom: false, bg: {}, name: '', guide: true };
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
  else if (a.type === 'endMonth') { modalOff = -1; eventLater = -1; }
  else if (a.type === 'choose' && r.text) toast(r.text, 'good');
  else if (a.type === 'formArmy' || a.type === 'split') toast('The army is formed. Tap a province on the map to march it.', 'good');
  else if (a.type === 'joinArmy' && r.joined === false) toast('The legion marches to join the army.', '');
  else if (a.type === 'people' && r.ok) toast(a.what === 'incite' ? (r.found ? 'They take your gold, and the Senate hears of it.' : 'They take your gold. The frontier will burn.') : a.what === 'subsidy' ? 'They will be quiet for six months.' : 'Vologases sends his friendship.', r.found ? 'bad' : 'good');
  else if ((a.type === 'motion' || a.type === 'court') && r.ok) toast(a.type === 'court' ? 'The senators dine well, and remember who paid.' : 'The Senate votes as you asked.', 'good');
  else if (a.type === 'payPart') toast(`Paid ${r.paid}k. They will wait three more months for the rest.`, 'good');
  else if (a.type === 'battleRound' && r && r.result) toast(r.result === 'won' ? 'Victory.' : r.result === 'lost' ? 'Defeat.' : 'Neither army broke.', r.result === 'won' ? 'good' : 'bad');
  refresh();
  return r;
}
function resultText(r) {
  return { cleared: 'Done: they are yours or out of the way.', aside: 'They stand aside for now.', lost: 'Beaten. Your men fall back.', blocked: 'You could not get past.', refused: 'They refuse.', withdrew: 'You fall back.' }[r] || '';
}
function refresh() { V = view(S); save(); render(); }
// the guide watches what you do, including which page you are looking at
function guideWatch() {
  if (!S || !V || !V.guide || screen !== 'game') return;
  const r = act(S, { type: 'guide', ui: { tab, dTab } });
  if (r && r.moved) setTimeout(refresh, 0);
}

// ---------- rendering
function hud() {
  const p = V.player;
  return `<div class="hud"><span class="turn">${esc(V.month)}</span><span>${n(p.treasury)}k <b class="${p.balance < 0 ? 'neg' : ''}">${p.balance >= 0 ? '+' : ''}${n(p.balance)}/mo</b></span><span>Legit. <b>${p.legit}</b></span><span class="${p.owed > p.treasury ? 'bad' : ''}">Owed <b>${n(p.owed)}k</b></span></div>`;
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
  const tabs = [['map', 'Map'], ['realm', 'Provinces'], ['army', 'Army'], ['diplomacy', 'Powers'], ...(V.rome ? [['rome', 'Rome']] : []), ['dispatches', 'News'], ['legate', 'Legate']];
  const dots = { army: V.pending.length > 0 || (V.act1 && !V.act1.approached), diplomacy: V.offers.length > 0, rome: !!(V.rome && V.rome.plotWarned) };
  return `<nav class="nav"><div class="nav-in">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}${V.guide && V.guide.tab === id && tab !== id ? ' pulse' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg>${dots[id] ? '<i class="dot"></i>' : ''}${label}</button>`).join('')}</div></nav>`;
}

function render() {
  if (screen === 'title') return renderTitle();
  if (screen === 'newgame') return renderNewGame();
  if (V.outcome || !V.player.alive) return renderEnd();
  if (V.battle) return renderBattle();
  if (V.report) return renderPage(reportPage());
  if (V.story) return renderPage(storyPage());
  if (V.event && eventLater !== V.turn) return renderPage(eventPage());
  const body = { map: mapScreen, realm: realmScreen, army: armyScreen, diplomacy: diplomacyScreen, rome: romeScreen, dispatches: dispatchScreen, legate: legateScreen }[tab] || mapScreen;
  setTimeout(guideWatch, 0);
  $app.innerHTML = hud() + body() + nav() + `<button class="endmonth" data-act="end-turn">End month${V.pending.length ? '<small>undecided: your army falls back</small>' : V.event ? '<small>a decision is waiting</small>' : ''}</button>` + modal();
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
  legionary: ['Legionary', 'Rivals slower and fewer; hold Rome 14 months.'],
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
  if (o.comrades) parts.push(`comrades ${SERVED[o.comrades] || o.comrades}`);
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
    <h2>A guide</h2><div class="seg" style="grid-template-columns:1fr 1fr"><button class="${ng.guide ? 'on' : ''}" data-ng='{"guide":true}'>Guide me through the first months</button><button class="${ng.guide ? '' : 'on'}" data-ng='{"guide":false}'>I know the way</button></div>
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
    retired: 'You took the villa in Campania. You grow old among your vines, and read about the war in letters from friends.',
  }[o.cause] || o.cause;
  $app.innerHTML = `<div class="end"><h1>${o.win ? 'Imperator' : 'The end'}</h1><p class="note">${esc(V.month)}</p><p>${esc(text)}</p>
    <div class="card" style="text-align:left"><div class="row">Legions at the end<span>${V.legions.length}</span></div><div class="row">Provinces<span>${V.provinces.filter((p) => p.mine).length}</span></div><div class="row">Legitimacy<span>${V.player.legit}</span></div></div>
    <button class="btn primary block" data-act="new">New campaign</button><button class="btn block" data-act="title">Title</button></div>`;
}

// ---------- the map
function mapScreen() {
  const legendOwners = [...new Map(V.provinces.filter((p) => p.owner !== 'state').map((p) => [p.owner, p])).values()];
  return `<div class="screen mapscreen"><div class="mapwrap" id="mapwrap">
    <div class="zoom"><button data-zoom="1.4" aria-label="Zoom in">+</button><button data-zoom="0.7" aria-label="Zoom out">−</button><button data-act="home" title="Your army" aria-label="Centre on your army">◎</button></div>
    <div class="topstack">${objectiveBar(false)}<div class="legend">${legendOwners.slice(0, 6).map((p) => `<div><i style="background:${p.color}"></i>${esc(p.owner === 'player' ? 'You' : p.ownerName)}</div>`).join('')}<div><i style="background:#B9BDC3"></i>The Senate</div></div></div>
  </div></div>${sel ? provinceSheet(sel) : V.act1 ? `<div class="sheet"><div class="sheet-in">${act1Card(true)}</div></div>` : ''}`;
}

function marchButtons(pid) {
  return V.myArmies.filter((a) => !a.column && a.loc !== pid).map((a) => `<button class="btn ${a.leader ? 'primary' : ''}" ${A({ type: 'march', armyId: a.id, dest: pid })}>March ${a.leader ? 'your army' : esc(a.commander.split(' ').slice(-1)[0])} here</button>`).join('');
}
function provinceSheet(pid) {
  const p = V.provinces.find((x) => x.id === pid);
  const pl = V.player;
  const myLegsHere = V.legions.filter((l) => l.loc === pid);
  const others = p.legions.filter((l) => l.owner !== 'player');
  const curTax = p.taxes ? p.taxes.find((t) => t.level === p.tax) : null;
  return `<div class="sheet"><div class="sheet-in">
    <div class="bar"><div><h3>${esc(p.name)}</h3><div class="sub">${p.mine ? 'Yours' : esc(p.ownerName === 'the Senate' ? 'Loyal to the Senate' : 'Held by ' + p.ownerName)} · ${p.tier === 'italy' ? 'Italy' : p.tier === 'proc' ? 'procurator\'s district' : p.tier + ' province'}</div></div><button class="x" data-act="close-sheet" aria-label="Close">×</button></div>
    <div class="body">
      <div class="stats4"><div><b>${curTax ? curTax.rev : p.rev}k</b>revenue</div><div><b>${p.grain}</b>grain</div><div class="${p.unrest > 50 ? 'bad' : ''}"><b>${p.unrest}</b>unrest</div><div class="${p.threat >= 60 ? 'bad' : ''}"><b>${p.threat ?? '–'}</b>${p.frontier ? 'frontier' : 'no frontier'}</div></div>
      ${p.breach ? '<p class="note" style="color:var(--crimson)">The frontier has broken here: no revenue for some months.</p>' : ''}
      ${p.mine ? `
        <div class="tabs">${[['overview', 'Overview'], ['buildings', `Buildings ${p.worksUsed}/${p.slots}`], ['forces', 'Forces'], ['governor', 'Governor']].map(([id, l]) => `<button class="${pTab === id ? 'on' : ''}" data-act="ptab" data-ptab="${id}">${l}</button>`).join('')}</div>
        ${pTab === 'overview' ? `
        <div class="label">Taxes</div><div class="seg">${p.taxes.map((t) => `<button class="${p.tax === t.level ? 'on' : ''}" ${A({ type: 'tax', pid, level: t.level })}>${t.level === 'extort' ? 'Extort' : t.level[0].toUpperCase() + t.level.slice(1)}<small>${t.rev}k · ${t.unrest > 0 ? '+' : ''}${t.unrest}</small></button>`).join('')}</div>
        <p class="note">Revenue a month · unrest change a month${p.revMult ? ` · works and governor add ${p.revMult}%` : ''}.</p>
        ${p.grain ? `<div class="label">Grain</div><div class="seg three">${[['ship', 'Ship to Rome'], ['hold', 'Hold'], ['embargo', 'Embargo']].map(([k, l]) => `<button class="${p.grainPolicy === k ? 'on' : ''}" ${A({ type: 'grain', pid, policy: k })}>${l}</button>`).join('')}</div><p class="note">Shipping sells grain to whoever rules Rome. An embargo starves him.</p>` : ''}
        ${p.goods.length ? `<div class="row">Goods for market<span>${esc(p.goods.join(', '))}</span></div>` : ''}
        <div class="label">The people</div>
        <button class="btn block" ${A({ type: 'games', pid })} ${p.games ? 'disabled' : ''}>${p.games ? 'Games given this month' : `Give games · ${p.gamesCost}k · unrest falls sharply`}</button>
        <div class="label">Works</div>
        <div class="row">${p.worksUsed} of ${p.slots} sites used${p.building ? ` · ${esc(p.building.name)} ready ${esc(p.building.done)}` : ''}<button class="btn small" data-act="ptab" data-ptab="buildings">${p.canBuildAny ? 'Build' : 'See works'}</button></div>
        <div class="label">Forces</div>
        <div class="row">${myLegsHere.length} legion${myLegsHere.length === 1 ? '' : 's'} · ${n(p.aux)} auxiliaries<button class="btn small" data-act="ptab" data-ptab="forces">Forces</button></div>
        <details class="guide"><summary>How provinces work</summary><p>Taxes trade money for unrest: above 60 unrest revenue halves, above 85 the province revolts unless a legion stands there. Works cost money and months, then pay off every month; one at a time. Legions in their own province cost less in pay. A governor's trait shapes the province: pick one in the Governor tab.</p></details>
        ` : pTab === 'buildings' ? `
        <div class="label">Works · ${p.buildings.length + (p.building ? 1 : 0)} of ${p.slots} sites</div>
        <div class="slots">${Array.from({ length: p.slots }, (_, i) => { const b = p.buildings[i]; if (b) return `<div class="slot built" title="${esc(b.does)}"><svg viewBox="0 0 8 8">${ICON8[b.id] || ''}</svg>${esc(b.name)}</div>`; if (i === p.buildings.length && p.building) return `<div class="slot building"><svg viewBox="0 0 8 8">${ICON8[p.building.id] || ''}</svg>${esc(p.building.name)}<br><small>ready ${esc(p.building.done)}</small></div>`; return '<div class="slot">Empty site</div>'; }).join('')}</div>
        ${p.works.filter((w) => !w.built).map((w) => `<button class="opt" ${A({ type: 'build', pid, building: w.id })} ${w.why ? 'disabled' : ''}><b>${esc(w.name)} <span>${w.cost}k · ${w.months} month${w.months === 1 ? '' : 's'} · ${w.upkeep}k a month</span></b><em>${esc(w.why || w.does)}</em></button>`).join('')}
        ` : pTab === 'forces' ? `
        ${myLegsHere.length ? myLegsHere.map((l) => `<div class="row"><div>${esc(l.name)}<small>${n(l.men)} men · loyalty ${l.loyalty}${l.army ? ' · with the army' : ' · stationed here'}</small></div><button class="btn small" ${A({ type: 'garrison', legionId: l.id, on: !l.garrison })}>${l.garrison ? 'Join the army' : 'Garrison here'}</button></div>`).join('') : '<p class="note">No legion stationed here.</p>'}
        <div class="row">Auxiliary garrison<span>${n(p.aux)} men</span></div>
        <button class="btn block" ${A({ type: 'levy', pid })} ${p.canLevy ? '' : 'disabled'}>Raise a legion here · ${p.levyCost}k, ${p.levyMonths} months</button>
        <div class="btns">${marchButtons(pid)}</div>
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
        ${p.goods.length ? `<div class="row">Goods<span>${esc(p.goods.join(', '))}</span></div>` : ''}
        ${p.chest ? `<div class="row">Treasury to seize<span class="pill good">${n(p.chest)}k</span></div>` : ''}
        <div class="btns">
          ${pl.ownsProvince ? marchButtons(pid) : ''}
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
    <div class="card"><div class="row">Revenue a month<span>${n(income)}k</span></div>${V.player.trade ? `<div class="row">Trade<span>+${n(V.player.trade)}k</span></div>` : ''}<div class="row">Legions' pay<span>−${n(pay)}k</span></div>${V.player.upkeep ? `<div class="row">Upkeep of works<span>−${n(V.player.upkeep)}k</span></div>` : ''}${V.player.interest ? `<div class="row">Interest<span>−${n(V.player.interest)}k</span></div>` : ''}<div class="row"><b>Balance</b><b class="${V.player.balance < 0 ? 'neg' : ''}">${V.player.balance >= 0 ? '+' : ''}${n(V.player.balance)}k</b></div></div>
    ${mine.length ? `<div class="label">Set every province's taxes</div><div class="seg">${['light', 'normal', 'heavy', 'extort'].map((t) => `<button ${A({ type: 'taxAll', level: t })}>${t === 'extort' ? 'Extort' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>` : '<p class="note">You hold no province yet.</p>'}
    ${mine.map((p) => `<div class="card"><h3>${esc(p.name)} <small>${p.tax} taxes</small></h3><div class="row">Revenue<span>${p.taxes.find((t) => t.level === p.tax).rev}k</span></div><div class="row">Unrest<span class="pill ${p.unrest > 50 ? 'bad' : ''}">${p.unrest}</span></div>${p.frontier ? `<div class="row">Frontier threat<span class="pill ${p.threat >= 60 ? 'bad' : ''}">${p.threat}</span></div>` : ''}<div class="row">Works<span>${p.worksUsed} of ${p.slots}${p.building ? ' · building' : ''}</span></div>
      <div class="btns"><button class="btn small" data-sel="${p.id}" data-ptab="overview">Manage</button><button class="btn small ${p.canBuildAny ? 'primary' : ''}" data-sel="${p.id}" data-ptab="buildings">Build</button><button class="btn small" data-sel="${p.id}" data-ptab="forces">Forces</button><button class="btn small" data-sel="${p.id}" data-ptab="governor">Governor</button></div></div>`).join('')}
    <h2 class="sec">Neighbours you can write to</h2>
    ${V.provinces.filter((p) => p.canLetter).map((p) => `<div class="row"><div>${esc(p.name)}<small>governor loyal to the Senate</small></div><button class="btn small" ${A({ type: 'letter', pid: p.id })} ${V.player.letters > 0 ? '' : 'disabled'}>Letter · 20k</button></div>`).join('') || '<p class="note">None: write to neutral governors next to your provinces, once you hold one.</p>'}
  </div>`;
}

// ---------- army
function legionRow(l, buttons) {
  return `<div class="row"><div style="flex:1">${esc(l.name)} ${l.client ? '<span class="pill">client</span>' : l.levy ? '<span class="pill">new</span>' : ''}${l.bought ? ' <span class="pill">bought</span>' : ''}${l.home ? ' <span class="pill good" title="In its own province: the province feeds it">home</span>' : ''}
    <small>${n(l.men)} men · pay ${l.pay}k${l.debt ? ` · owed ${l.debt}k ${l.overdue ? '(overdue)' : 'by ' + esc(l.due)}` : ''}</small>
    <div class="meter ${l.loyalty < 30 ? 'red' : ''}" style="margin-top:3px"><i style="width:${l.loyalty}%"></i></div></div>
    ${buttons || ''}</div>`;
}
const TAB_NAME = { army: 'Army', realm: 'Provinces', map: 'Map', diplomacy: 'Powers', rome: 'Rome', dispatches: 'News', legate: 'Legate' };
function objectiveBar(overlay) {
  const g = V.guide;
  if (g) return `<div class="objective guide ${overlay ? 'over' : ''}"><b>Guide ${Math.min(g.index + 1, g.count)}/${g.count}</b> ${esc(g.text)}
    <div class="btns" style="margin-top:4px">${g.tab && g.tab !== tab ? `<button class="btn small" data-tab="${g.tab}">Open ${TAB_NAME[g.tab]}</button>` : ''}${g.last ? `<button class="btn small" data-a='{"type":"guide","finish":true}'>Finish the guide</button>` : `<button class="btn small" data-a='{"type":"guide","skip":true}'>Skip the guide</button>`}</div></div>`;
  const o = V.objective;
  if (!o) return '';
  const go = V.event ? ' <button class="btn small" data-act="open-event">Open</button>' : o.tab && o.tab !== tab ? ` <button class="btn small" data-tab="${o.tab}">Go</button>` : '';
  return `<div class="objective ${overlay ? 'over' : ''}"><b>Now</b> ${esc(o.text)}${go}</div>`;
}
function act1Card(compact) {
  const a = V.act1;
  if (!a) return '';
  return `<div class="bar"><div><h3>Act I · ${esc(a.provName)}</h3><div class="sub">${a.share}% of the legionaries here are yours · three-quarters wins the governor</div></div></div>
    <div class="body">
      <div class="label">Suspicion</div><div class="meter red"><i style="width:${a.suspicion}%"></i></div>
      <p class="note">At 100 Rome recalls you. Buying and talking raise it a little; fighting in the camp raises it a lot. It cools by itself.</p>
      ${a.neroLives ? '<p class="note"><b>Nero still lives.</b> Men hold to their oath: every approach is harder and dearer until the news of his fall (June 68). Waiting is a choice.</p>' : ''}
      <p class="note">Until the province is yours the Senate pays your legion and you draw a legate's salary (+15k a month). Taking the province gives you its treasury.</p>
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
    ${b.options.filter((o) => !(noBypass && o.id === 'bypass')).map((o) => `<button class="opt" data-choice ${A(mk(o.id))} ${o.ok ? '' : 'disabled'}><b>${esc(o.label)} <span>${esc(o.cost)}</span></b>${o.ok ? `<em>${esc(OPT_HINT[o.id] || '')}${o.note ? ' ' + esc(o.note) : ''}</em>` : `<em>${esc(o.why)}</em>`}</button>`).join('')}
  </div>`;
}
const OPT_HINT = {
  buy: 'Bought men stay bought while the money lasts.',
  promise: 'A debt: unpaid past its day, they turn sour. You can pay half later to buy three months.',
  negotiate: 'Costs nothing but a little standing if refused; they may simply stand aside.',
  fight: 'Men lost now take months to replace.',
  bypass: 'Faster, but every enemy left behind threatens your supply.',
};
// One encounter: your side, their side, and what you can do.
function pendingCard(pd, inModal) {
  const you = pd.yours;
  const head = `<div class="vs"><div><small>Yours</small><b>${n(you.men)}</b> men · ${you.legions} legion${you.legions === 1 ? '' : 's'}<br><small>${esc(you.commander === 'You' ? 'You command' : you.commander + ' commands')}</small></div>`;
  if (pd.defence) {
    const e = pd.enemy;
    return `${head}<div><small>${esc(e.name)}</small><b>${n(e.men)}</b> men · ${e.legions} legion${e.legions === 1 ? '' : 's'}<br><small>${esc(e.odds)}</small></div></div>
      <p class="note">${esc(e.name)}'s army is coming at yours in ${esc(pd.provName)}. ${esc(e.general || '')}${e.large ? ' It will be a pitched battle: you give the orders.' : ''}</p>
      <button class="opt" data-choice ${A({ type: 'encounter', pendingId: pd.id, option: 'fight' })}><b>Stand and fight <span>${esc(e.odds)}</span></b><em>${e.large ? 'A battle on the field. You can sound the retreat if it goes badly.' : 'A sharp fight; the loser falls back.'}</em></button>
      <button class="opt" data-choice ${A({ type: 'encounter', pendingId: pd.id, option: 'withdraw' })}><b>Fall back <span>toward ${esc(pd.retreatTo || 'safety')}</span></b><em>The rearguard loses about ${pd.rearguard}% of your men. ${esc(pd.provName)} is left to them.</em></button>`;
  }
  const b = inModal ? pd.bodies.slice(0, 1) : pd.bodies;
  return `${head}<div><small>Before you</small><b>${n(pd.bodies.reduce((a, x) => a + (x.men || 0), 0))}</b> men<br><small>${pd.bodies.length} bod${pd.bodies.length === 1 ? 'y' : 'ies'} of men</small></div></div>
    ${b.map((x) => bodyCard(x, (opt) => ({ type: 'encounter', pendingId: pd.id, key: x.key, option: opt }))).join('')}
    ${inModal && pd.bodies.length > 1 ? '<p class="note">More in the Army tab.</p>' : ''}
    <button class="btn block" data-choice ${A({ type: 'encounter', pendingId: pd.id, option: 'withdraw' })}>Fall back toward ${esc(pd.retreatTo || 'where you came from')}</button>`;
}
function armyCard(a) {
  const free = V.generals.filter((g) => !g.army);
  const title = a.leader ? 'Your army' : a.column ? `Column joining ${esc(a.joining === 'You' ? 'your army' : a.joining + "'s army")}` : `Army of ${esc(a.commander)}`;
  return `<div class="card ${a.leader ? 'gold' : ''}"><h3>${title} <small>${a.leader ? 'you command' : a.styleText ? esc(a.style) : a.column ? '' : 'no general'}</small></h3>
    <div class="row">At<span>${esc(a.locName)}</span></div>
    <div class="row">${a.dest ? 'Marching to' : 'Orders'}<span>${a.dest ? `${esc(a.destName)} · ${a.stages} stage${a.stages === 1 ? '' : 's'}` : a.halted ? 'Facing an enemy' : a.waiting ? 'Resting this month' : 'Encamped'}</span></div>
    <div class="row">Men · strength<span>${n(a.men)} · ${a.power}k</span></div>
    ${a.over ? `<p class="note" style="color:var(--crimson)">More than eight legions in one place: they go hungry and lose men every month. Split the army.</p>` : ''}
    ${a.halted ? '<p class="note" style="color:var(--crimson)">Facing an enemy: decide above.</p>' : ''}
    ${a.legions.map((l) => legionRow(l, `<button class="btn small" ${A({ type: 'detach', legionId: l.id })}>Leave here</button>`)).join('')}
    <div class="btns">
      ${a.dest ? `<button class="btn small" ${A({ type: 'halt', armyId: a.id })}>Halt</button>` : ''}
      ${!a.leader && !a.column ? `<button class="btn small" ${A({ type: 'disband', armyId: a.id })}>Disband into garrisons</button>` : ''}
      ${!a.leader && !a.column ? free.map((g) => `<button class="btn small" ${A({ type: 'assignGeneral', armyId: a.id, general: g.id })}>Give it to ${esc(g.name)}</button>`).join('') : ''}
      ${!a.column && a.legions.length > 1 ? free.map((g) => `<button class="btn small" ${A({ type: 'split', armyId: a.id, general: g.id })}>Split: half to ${esc(g.name)}</button>`).join('') : ''}
    </div>
    ${a.column ? '' : '<p class="note">To march: tap a province on the map and choose this army.</p>'}</div>`;
}
function armyScreen() {
  const p = V.player;
  if (V.act1) return `<div class="screen">${objectiveBar()}<div class="card" style="padding:0;overflow:hidden">${act1Card(false)}</div>${V.legions.map((l) => legionRow(l)).join('')}</div>`;
  const due = V.legions.filter((l) => l.debt > 0);
  const free = V.generals.filter((g) => !g.army);
  const fieldArmies = V.myArmies.filter((a) => !a.column);
  return `<div class="screen">${objectiveBar()}
    ${V.pending.map((pd) => `<h2 class="sec">${pd.defence ? 'Attacked' : 'At'} ${esc(pd.provName)}</h2><div class="card gold">${pendingCard(pd, false)}</div>`).join('')}
    ${p.canAcclaim ? `<div class="card gold"><h3>Be proclaimed imperator</h3><p class="note">Your legions will hail you. Every rival will treat you as one, and the promises you made fall due sooner. Legitimacy +10.</p><button class="btn purple block" data-act="acclaim">Let them hail you</button></div>` : ''}
    <h2 class="sec">Armies</h2>
    ${V.myArmies.map(armyCard).join('') || '<p class="note">No army in the field.</p>'}
    <h2 class="sec">Garrisons</h2>
    <p class="note">Legions not in an army hold the province they stand in. In their own province they cost less: the province feeds them.</p>
    ${V.garrisons.map((g) => `<div class="card"><h3>${esc(g.name)} <small>${g.legions.length} legion${g.legions.length === 1 ? '' : 's'}</small></h3>
      ${g.legions.map((l) => legionRow(l, fieldArmies.slice(0, 2).map((a) => `<button class="btn small" ${A({ type: 'joinArmy', legionId: l.id, armyId: a.id })}>${a.loc === l.loc ? 'Join' : 'Send to'} ${esc(a.leader ? 'you' : a.commander.split(' ').slice(-1)[0])}</button>`).join(''))).join('')}
      ${free.length ? `<div class="btns">${free.map((gn) => `<button class="btn small" ${A({ type: 'formArmy', pid: g.pid, general: gn.id })}>Form an army under ${esc(gn.name)}</button>`).join('')}</div>` : ''}
    </div>`).join('') || '<p class="note">Every legion is with an army.</p>'}
    <h2 class="sec">Generals · ${V.generals.length} of ${V.maxGenerals}</h2>
    ${V.generals.map((g) => `<div class="row"><div>${esc(g.name)}<small>${esc(g.styleText)} · skill ${g.skill}</small></div><span class="pill ${g.army ? 'good' : ''}">${g.army ? 'commands at ' + esc(g.armyAt) : 'free'}</span></div>`).join('') || '<p class="note">No general has sworn to you yet. Men come over when you win provinces, when rivals submit, and sometimes on their own.</p>'}
    ${due.length ? `<h2 class="sec">Promises</h2><p class="note">Unpaid past their day, they cost loyalty every month. Paying half buys ${3} more months, once.</p>${due.map((l) => `<div class="row"><div>${esc(l.name)}<small>${l.debt}k ${l.overdue ? '· overdue' : '· due ' + esc(l.due)}</small></div><div class="btns" style="margin:0">${l.canPart ? `<button class="btn small" ${A({ type: 'payPart', legionId: l.id })}>Pay half</button>` : ''}<button class="btn small" ${A({ type: 'pay', legionId: l.id })}>Pay</button></div></div>`).join('')}` : ''}
  </div>`;
}
// ---------- powers: rivals, the Senate, the frontiers, trade
const KIND = { hist: 'Claimant', minor: 'Rebel', proc: 'Usurper' };
const MOTION = {
  decree: ['Legate of the Senate and People', 'Legitimacy +8. As Galba styled himself.'],
  imperium: ['Proconsular imperium', 'Legitimacy +4; the Senate will recognise you at legitimacy 15 instead of 25. Favour −5.'],
  thanks: ['Thanksgiving for a victory', 'Legitimacy +5, after a pitched battle won in the last two months.'],
  aerarium: ['Open the treasury of Saturn', '+300k now. Favour −15, legitimacy −3. Refills in six months.'],
  exiles: ["Restore Nero's exiles", '100k to buy back their estates. Favour +12, legitimacy +2. Once.'],
};
function powersTabs() {
  const tabs = [['rivals', 'Rivals'], ['senate', 'Senate'], ['frontiers', 'Frontiers'], ['trade', 'Trade']];
  return `<div class="seg four" style="margin-bottom:10px">${tabs.map(([id, l]) => `<button class="${dTab === id ? 'on' : ''}" data-act="dtab" data-dtab="${id}">${l}</button>`).join('')}</div>`;
}
function diplomacyScreen() {
  const body = { rivals: rivalsPane, senate: senatePane, frontiers: frontiersPane, trade: tradePane }[dTab] || rivalsPane;
  return `<div class="screen">${powersTabs()}${body()}</div>`;
}
function offerText(o) {
  return o.type === 'submission' ? 'offers to submit to you, with his legions and provinces, for an office you will owe him. He will command his army for you.'
    : o.type === 'alliance' ? `proposes an alliance against ${esc(o.targetName)}.` : o.type === 'trade' ? 'proposes a trade agreement: his merchants in your markets, yours in his.' : `proposes a truce for ${o.months} months.`;
}
function rivalsPane() {
  const p = V.player;
  const alive = V.factions.filter((f) => f.alive);
  const strongest = [...alive].sort((a, b) => b.strength - a.strength);
  return `${V.offers.length ? `<h2 class="sec">Offers</h2>${V.offers.map((o) => `<div class="card gold"><h3>${esc(o.fromName)}</h3><p class="note">${offerText(o)}</p><div class="btns"><button class="btn primary" data-choice ${A({ type: 'answer', offerId: o.id, accept: true })}>Accept</button><button class="btn" data-choice ${A({ type: 'answer', offerId: o.id, accept: false })}>Decline</button></div></div>`).join('')}` : ''}
    <h2 class="sec">Rivals</h2><p class="note">Envoys left this month: ${p.envoys}. Each proposal shows how he is likely to take it, and why. Gold sweetens a truce.</p>
    ${strongest.map((f) => `<div class="card"><h3><span><i class="chip" style="background:${f.color}"></i>${esc(f.name)}</span><small>${KIND[f.kind] || ''}${f.acclaimed ? ' · proclaimed' : ''}${f.hostis ? ' · public enemy' : ''}</small></h3>
      ${f.personality ? `<p class="note">${esc(f.personality)}</p>` : ''}
      <div class="row">Legions · provinces<span>${f.legions} · ${f.provinces}</span></div>
      <div class="row">His standing with you<span class="pill ${f.standing >= 30 ? 'good' : f.standing <= -30 ? 'bad' : ''}">${f.standing}</span></div>
      <div class="row">The Senate's favour<span>${f.favour}</span></div>
      <div class="row">Distance<span>${f.distance != null ? f.distance + (f.distance === 1 ? ' month' : ' months') : '–'}</span></div>
      ${f.treaty ? `<div class="row">Treaty<span class="pill good">${f.treaty.type}${f.treaty.until ? ' to ' + esc(monthOf(f.treaty.until)) : ''}</span></div>` : ''}
      ${f.trading ? '<div class="row">Trade<span class="pill good">agreement</span></div>' : ''}
      <div class="btns">
        ${f.treaty ? `<button class="btn small" ${A({ type: 'breakTreaty', treatyId: f.treaty.id })}>Break the treaty</button>` : `<button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'truce', months: 12 })} ${p.envoys > 0 ? '' : 'disabled'}>Truce · ${f.truce.ok ? 'likely' : 'unlikely'}</button><button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'truce', months: 12, gold: 150 })} ${p.envoys > 0 && p.treasury >= 150 ? '' : 'disabled'}>Truce with 150k</button>`}
        <button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'submission' })} ${p.envoys > 0 ? '' : 'disabled'}>Demand submission · ${f.submission.ok ? 'likely' : 'unlikely'}</button>
        <button class="btn small" ${A({ type: 'gift', to: f.id, amount: 60 })}>Gift · 60k</button>
        ${f.treaty && !f.trading ? `<button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'trade' })} ${p.envoys > 0 && f.tradeEval.score > 0 ? '' : 'disabled'}>Trade · ${f.tradeEval.ok ? 'likely' : 'unlikely'}</button>` : ''}
      </div>
      ${!f.treaty ? `<p class="note">${esc([...f.truce.reasons].slice(0, 2).join('; ') || ' ')}</p>` : f.trading ? '' : `<p class="note">Trade: you would get ${esc(f.gains.you.join(', ') || 'nothing new')}; he would get ${esc(f.gains.him.join(', ') || 'nothing new')}. ${esc(f.tradeEval.reasons.slice(0, 2).join('; '))}</p>`}
      ${f.cedable.length ? `<div class="label">Demand a province</div><div class="btns">${f.cedable.slice(0, 3).map((c) => `<button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'cede', target: c.id })} ${p.envoys > 0 ? '' : 'disabled'}>${esc(c.name)} · ${c.eval.ok ? 'likely' : 'unlikely'}</button>`).join('')}</div>` : ''}
      ${!f.treaty && strongest.filter((g) => g.id !== f.id).length ? `<div class="btns">${strongest.filter((g) => g.id !== f.id).slice(0, 2).map((g) => `<button class="btn small" ${A({ type: 'propose', to: f.id, kind: 'alliance', target: g.id })} ${p.envoys > 0 ? '' : 'disabled'}>Ally against ${esc(g.name.split(' ').slice(-1)[0])}</button>`).join('')}</div>` : ''}
    </div>`).join('') || '<p class="note">No rival claimant has risen yet.</p>'}
    <h2 class="sec">Kings and foreign powers</h2>
    ${V.clients.map((c) => `<div class="row"><div>${esc(c.name)}<small>${n(c.men)} men · ${c.cost}k${c.parthian ? ' · Romans will not forgive Parthians in Italy: legitimacy −15' : ''}${c.why ? ' · ' + esc(c.why) : ''}</small></div><button class="btn small" ${A({ type: 'client', client: c.id })} ${c.why ? 'disabled' : ''}>Ask</button></div>`).join('')}
    <h2 class="sec">Gold among their legions</h2><p class="note">A legion far from its general can be turned. If you are found out, its master will not forget.</p>
    ${V.subvertable.map((l) => `<div class="row"><div>${esc(l.name)}<small>${esc(l.owner)} · ${esc(PNAME[l.loc])} · loyalty ${l.loyalty}</small></div><button class="btn small" ${A({ type: 'subvert', legionId: l.id })} ${l.ok ? '' : 'disabled'}>${l.cost}k</button></div>`).join('') || '<p class="note">No rival legion stands apart from its general.</p>'}`;
}
function senatePane() {
  const S = V.senate;
  return `<h2 class="sec">The Senate</h2>
    <div class="card"><div class="row">Its favour toward you<span class="pill ${S.favour >= 60 ? 'good' : S.favour < 25 ? 'bad' : ''}">${S.favour}</span></div>
      <div class="meter purple"><i style="width:${S.favour}%"></i></div>
      ${S.hostis ? `<p class="note" style="color:var(--crimson)"><b>You are a public enemy</b> until ${esc(monthOf(S.hostisUntil))}. The Senate will not recognise you; your legions waver. Taking Rome makes them think again.</p>` : ''}
      <div class="row">Recognition needs legitimacy<span>${S.recognition}${S.imperium ? ' (imperium)' : ''}</span></div>
      <p class="note">Favour drifts toward what your legitimacy deserves. Gifts and honours raise it; plunder, broken treaties, terror and barbarian allies lower it. At 60 the Senate warns you of plots; under 25 it sharpens knives.</p>
      <button class="btn block" ${A({ type: 'court' })} ${S.courted || V.player.treasury < 80 ? 'disabled' : ''}>${S.courted ? 'Courted this month' : 'Court the senators · 80k · favour +8'}</button></div>
    <h2 class="sec">Motions${S.motionUsed ? ' · used this month' : ' · one a month'}</h2>
    ${S.motions.map((m) => `<button class="opt" ${A({ type: 'motion', motion: m.id })} ${m.why ? 'disabled' : ''}><b>${esc(MOTION[m.id][0])}${m.id === 'decree' ? ` <span>${S.decreeCost}k</span>` : ''}</b><em>${esc(m.why || MOTION[m.id][1])}</em></button>`).join('')}
    <h2 class="sec">Declare a public enemy</h2>
    <p class="note">Hold Rome or the throne, with favour of 60 or more and 15 above his. He loses legitimacy, his legions waver, and the Senate cannot recognise him for a year. Favour −10.</p>
    ${S.rivals.map((r) => `<div class="row"><div>${esc(r.name)}<small>favour ${r.favour}${r.hostis ? ' · already a public enemy' : ''}</small></div><button class="btn small" ${A({ type: 'motion', motion: 'hostis', target: r.id })} ${r.why ? 'disabled' : ''}>Outlaw</button></div>`).join('') || '<p class="note">No rival yet.</p>'}`;
}
const FRONTIER_NAME = { britain: 'British', rhine: 'Rhine', danube: 'Danube', east: 'Eastern', judaea: 'Judaean', africa: 'African' };
function frontiersPane() {
  return `<h2 class="sec">Beyond the frontiers</h2>
    <p class="note">Gold keeps a people quiet for six months, or sets them on whoever holds their frontier: only a frontier you hold none of. If it comes out, the Senate will not forgive it.</p>
    ${V.peoples.map((q) => `<div class="card"><h3>${esc(q.name.charAt(0).toUpperCase() + q.name.slice(1))} <small>${esc(FRONTIER_NAME[q.frontier] || q.frontier)} frontier</small></h3>
      <p class="note">${esc(q.note)}</p>
      <div class="row">Threat<span class="pill ${q.threat >= 70 ? 'bad' : ''}">${q.threat}</span></div>
      <div class="meter red"><i style="width:${Math.min(100, q.threat)}%"></i></div>
      <div class="row">Frontier held by<span>${esc(q.holders.join(', '))}</span></div>
      ${q.subsidised ? `<div class="row">Paid to keep quiet<span>by ${esc(q.subsidised.by)} to ${esc(monthOf(q.subsidised.until))}</span></div>` : ''}
      ${q.incited ? '<div class="row">Up in arms<span class="pill bad">incited</span></div>' : ''}
      ${q.treaty ? `<div class="row">Friend of<span>${esc(q.friend || 'no Roman')}</span></div>` : ''}
      <div class="btns">
        <button class="btn small" ${A({ type: 'people', people: q.id, what: 'subsidy' })} ${q.why.subsidy ? 'disabled' : ''}>Subsidy · ${q.subsidy}k</button>
        <button class="btn small" ${A({ type: 'people', people: q.id, what: 'incite' })} ${q.why.incite ? 'disabled' : ''}>Incite · ${q.incite}k</button>
        ${q.treaty ? `<button class="btn small" ${A({ type: 'people', people: q.id, what: 'treaty' })} ${q.why.treaty ? 'disabled' : ''}>Friendship · ${q.treaty}k</button>` : ''}
      </div>
      <p class="note">${esc([q.why.subsidy && 'Subsidy: ' + q.why.subsidy, q.why.incite && 'Incite: ' + q.why.incite, q.treaty && q.why.treaty && 'Friendship: ' + q.why.treaty].filter(Boolean).join(' · '))}</p></div>`).join('')}`;
}
function tradePane() {
  const t = V.tradeParts;
  return `<h2 class="sec">Trade</h2>
    <div class="card"><div class="row">Markets<span>${n(t.market)}k a month</span></div><div class="row">Agreements<span>${n(t.agreements)}k</span></div>${t.silk ? `<div class="row">The silk road<span>${n(t.silk)}k</span></div>` : ''}<div class="row"><b>Trade income</b><b>${n(t.total)}k</b></div>
      <p class="note">Each good your provinces make brings merchant income; a harbour adds to it. Agreements with rivals at peace bring their goods and more income. War closes the roads.${V.partners.length ? ' You trade with ' + esc(V.partners.join(', ')) + '.' : ''}</p></div>
    <h2 class="sec">Goods</h2>
    ${V.goods.map((g) => `<div class="row"><div>${esc(g.name)} ${g.held ? `<span class="pill good">${g.own ? 'yours' : 'traded'}</span>` : ''}<small>${esc(g.does)}${g.from.length ? ' · from ' + esc(g.from.join(', ')) : ''}</small></div></div>`).join('')}
    <p class="note">You hold a good if you own a province that makes it, or trade with someone who does. Propose trade from the Rivals page, once you have a truce or an alliance.</p>`;
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
      ${[['dole', 'Grain dole', 'The crowd calms.'], ['senators', 'Buy senators', 'Legitimacy +4; the Senate\'s favour +10.'], ['consulships', 'Consulships for friends', 'Legitimacy +2.'], ['games', 'Games and largesse', 'Legitimacy +2; the crowd calms.'], ['informers', 'Pay informers', 'They may uncover a plot before it strikes.']].map(([k, l, d]) => `<button class="opt" ${A({ type: 'rome', spend: k })}><b>${l} <span>${r.costs[k]}k</span></b><em>${d}</em></button>`).join('')}`
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
    <p class="note">Your strongest road: <b>${esc(ROADS[p.road][0])}</b>. ${esc(ROADS[p.road][1])}.${p.comrades ? ` You served as a tribune ${esc(SERVED[p.comrades] || p.comrades)}: those legions remember you.` : ''}</p>
    <div class="card"><div class="row">Legitimacy<span>${p.legit}</span></div><div class="row">Proclaimed<span>${p.acclaimed ? 'Yes' : 'No'}</span></div><div class="row">Borrowed<span>${n(p.borrowed)}k</span></div><div class="row">Difficulty<span>${esc(DIFF[V.difficulty][0])}</span></div></div>
    ${V.generals.length ? `<h2 class="sec">Sworn to you</h2>${V.generals.map((g) => `<div class="row"><div>${esc(g.name)}<small>${esc(g.styleText)}</small></div><span class="pill">${g.army ? 'in command' : 'free'}</span></div>`).join('')}` : ''}
    ${V.storyLog.length ? `<h2 class="sec">Your story</h2>${V.storyLog.slice(0, 12).map((e) => `<div class="disp"><small>${esc(monthOf(e.t))} · ${esc(e.title)}</small><div><b>${esc(e.choice)}.</b> ${esc(e.text)}</div></div>`).join('')}` : ''}
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
    if (!pd.defence && !pd.bodies[0]) return '';
    return `<div class="modal"><div class="modal-in"><div class="bar"><div><h3>${pd.defence ? 'Attacked at ' : ''}${esc(pd.provName)}</h3><div class="sub">${pd.defence ? 'An enemy army is coming at yours' : 'Your army meets resistance'}</div></div><button class="x" data-act="close" aria-label="Close">×</button></div>
      <div class="body">${pendingCard(pd, true)}</div></div></div>`;
  }
  if (V.offers.length && tab !== 'diplomacy') {
    const o = V.offers[0];
    return `<div class="modal"><div class="modal-in"><div class="bar"><div><h3>An envoy from ${esc(o.fromName)}</h3></div><button class="x" data-act="close" aria-label="Close">×</button></div><div class="body">
      <p>He ${offerText(o)}</p>
      <div class="btns"><button class="btn primary" data-choice ${A({ type: 'answer', offerId: o.id, accept: true })}>Accept</button><button class="btn" data-choice ${A({ type: 'answer', offerId: o.id, accept: false })}>Decline</button></div></div></div></div>`;
  }
  return '';
}

// ---------- pages: the month's report, the story, a choice
function renderPage(html) { $app.innerHTML = hud() + `<div class="page">${html}</div>`; window.scrollTo(0, 0); }
const MONEY_WORD = { revenue: 'Taxes', pay: 'Legions\' pay', upkeep: 'Upkeep of works', interest: 'Interest', borrowed: 'Borrowed', "legate's salary": 'Your salary', 'provincial treasury': 'Treasuries seized', 'grain sold to Rome': 'Grain sold' };
function reportPage() {
  const r = V.report;
  const d = r.treasury[1] - r.treasury[0];
  const lines = [
    r.gained.length ? `<div class="row good">Provinces won<span>${esc(r.gained.join(', '))}</span></div>` : '',
    r.lost.length ? `<div class="row bad">Provinces lost<span>${esc(r.lost.join(', '))}</span></div>` : '',
    r.legionsGained.length ? `<div class="row good">Legions joined<span>${esc(r.legionsGained.join(', '))}</span></div>` : '',
    r.legionsLost.length ? `<div class="row bad">Legions lost<span>${esc(r.legionsLost.join(', '))}</span></div>` : '',
    r.men[1] !== r.men[0] ? `<div class="row">Men under arms<span>${n(r.men[0])} → ${n(r.men[1])}</span></div>` : '',
    r.legit[1] !== r.legit[0] ? `<div class="row">Legitimacy<span>${r.legit[0]} → ${r.legit[1]}</span></div>` : '',
  ].join('');
  return `<h2 class="display">${esc(r.month)}</h2><p class="note">What the month did.</p>
    <div class="card"><h3>Treasury <small>${n(r.treasury[0])}k → ${n(r.treasury[1])}k</small></h3>
      ${r.money.slice(0, 6).map(([k, x]) => `<div class="row">${esc(MONEY_WORD[k] || k[0].toUpperCase() + k.slice(1))}<span class="${x < 0 ? 'neg' : 'pos'}">${x > 0 ? '+' : ''}${n(x)}k</span></div>`).join('')}
      <div class="row"><b>Net</b><b class="${d < 0 ? 'neg' : 'pos'}">${d >= 0 ? '+' : ''}${n(d)}k</b></div></div>
    ${lines ? `<div class="card">${lines}</div>` : ''}
    ${r.news.length ? `<div class="label">News that reached you</div>${r.news.slice(0, 4).map((t) => `<div class="disp"><div>${esc(t)}</div></div>`).join('')}` : ''}
    ${r.warnings.length ? `<div class="label">Watch</div>${r.warnings.slice(0, 4).map((w) => `<div class="warn">${esc(w.text)}</div>`).join('')}` : ''}
    ${V.objective ? `<div class="objective"><b>Now</b> ${esc(V.objective.text)}</div>` : ''}
    <button class="btn primary block" data-a='{"type":"readReport"}'>Continue</button>`;
}
function storyPage() {
  const p = V.story;
  return `<div class="story ${esc(p.kind)}"><div class="laurel">${p.kind === 'act' ? 'A new act' : p.kind === 'guide' ? 'The road to the throne' : p.kind === 'you' ? 'Your command' : 'The world'}</div>
    <h2 class="display">${esc(p.title)}</h2>${p.text.map((t) => `<p>${esc(t)}</p>`).join('')}
    <button class="btn primary block" data-a='{"type":"readStory"}'>${p.left ? 'Continue' : 'Begin'}</button></div>`;
}
function eventPage() {
  const e = V.event;
  return `<div class="story event"><div class="laurel">A decision</div><h2 class="display">${esc(e.title)}</h2><p>${esc(e.text)}</p>
    ${e.options.map((o) => `<button class="opt" ${A({ type: 'choose', option: o.index })} ${o.why ? 'disabled' : ''}><b>${esc(o.label)}</b><em>${esc(o.why || o.hint)}</em></button>`).join('')}
    <p class="note">Leave it, and the last answer is taken for you at the month's end.</p>
    <button class="btn block" data-act="later">Decide later</button></div>`;
}

// ---------- events
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-a],[data-act],[data-tab],[data-ng],[data-ngbg],[data-sel],[data-zoom]');
  if (!t) return;
  if (t.dataset.a) { doAct(JSON.parse(t.dataset.a)); return; }
  if (t.dataset.tab) { tab = t.dataset.tab; if (tab !== 'map') sel = null; render(); return; }
  if (t.dataset.sel) { sel = t.dataset.sel; pTab = t.dataset.ptab || 'overview'; tab = 'map'; render(); map.focus(sel, 5); return; }
  if (t.dataset.zoom) { map.zoomAt(map.cw / 2, map.ch / 2, Number(t.dataset.zoom)); return; }
  if (t.dataset.ng) { Object.assign(ng, JSON.parse(t.dataset.ng)); ng.name = document.getElementById('nm')?.value || ng.name; renderNewGame(); return; }
  if (t.dataset.ngbg) { const [st, id] = JSON.parse(t.dataset.ngbg); ng.bg[st] = id; ng.name = document.getElementById('nm')?.value || ng.name; renderNewGame(); return; }
  const a = t.dataset.act;
  if (a === 'new') { screen = 'newgame'; renderNewGame(); }
  else if (a === 'title') { screen = 'title'; renderTitle(); }
  else if (a === 'start') {
    const name = document.getElementById('nm')?.value.trim();
    const qs = new URLSearchParams(location.search);
    S = newGame({ seed: Number(qs.get('seed')) || (Date.now() ^ (Math.random() * 1e9)) >>> 0, difficulty: ng.difficulty, start: ng.start, road: ng.road, background: ng.custom ? ng.bg : undefined, name: name || 'Gaius Valerius Corvus', guide: ng.guide });
    screen = 'game'; tab = V?.act1 ? 'army' : 'map'; sel = null; modalOff = -1; refresh(); tab = 'map'; render(); map.z = 0; map.resize(); map.focus(ng.start, 5);
  } else if (a === 'continue') { S = loadSaved(); if (S) { screen = 'game'; tab = 'map'; refresh(); map.z = 0; map.resize(); map.focus(S.factions.player.leaderArmy && S.armies[S.factions.player.leaderArmy] ? S.armies[S.factions.player.leaderArmy].loc : S.factions.player.base, 5); } }
  else if (a === 'end-turn') doAct({ type: 'endMonth' });
  else if (a === 'bedriacum') { S = bedriacum({ seed: (Date.now() % 100000) + 1 }); screen = 'game'; tab = 'map'; bChip = 'sector:1'; bSel = null; refresh(); }
  else if (a === 'bchip') { bChip = t.dataset.chip; render(); }
  else if (a === 'ptab') { pTab = t.dataset.ptab; render(); }
  else if (a === 'dtab') { dTab = t.dataset.dtab; render(); }
  else if (a === 'acclaim') doAct({ type: 'acclaim' });
  else if (a === 'decree') doAct({ type: 'decree' });
  else if (a === 'close') { modalOff = V.turn; render(); }
  else if (a === 'later') { eventLater = V.turn; render(); }
  else if (a === 'open-event') { eventLater = -1; render(); }
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
    b.present ? ['legate', 'You', { stay: 'with the eagles', ride: 'riding', rally: 'rallying', appeal: 'appealing', ruse: 'ruse' }[b.legate.action]] : ['legate', 'General', 'commands'],
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
  } else if (!b.present) {
    panel = `<p class="note"><b>${esc(b.yourGeneral)}</b> commands this army, not you. ${esc(b.yourGeneralText || '')} Give the lines their orders; the general keeps his place.</p>`;
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
  const result = b.over ? `<div class="card gold"><h3>${b.retreated ? 'Retreat' : { won: 'Victory', lost: 'Defeat', draw: 'Neither army broke' }[b.result]}</h3><p class="note">${b.retreated ? 'Your army leaves the field in order and falls back toward your nearest province.' : b.result === 'won' ? 'Their army breaks and runs. Some of their legions will come over to you.' : b.result === 'lost' ? 'Your army breaks. What is left falls back.' : 'Both armies draw off in the dark.'}</p><button class="btn primary block" data-a='{"type":"battleRound"}'>Return to the campaign</button></div>` : '';
  const controls = b.over ? '' : b.dusk
    ? `<div class="btns"><button class="btn primary" data-a='{"type":"battleDusk","fightOn":true}'>Fight on into the night</button><button class="btn" data-a='{"type":"battleDusk","fightOn":false}'>Break off</button></div><p class="note">At night everything is less certain, and men can hear each other across the lines.</p>`
    : `<button class="btn primary block trumpets" data-a='{"type":"battleRound"}'>Sound the trumpets <small>play one round</small></button><button class="btn block" data-a='{"type":"battleAuto"}'>Leave it to the ${b.present ? 'legates' : 'general'} <small>play it out</small></button>
      <button class="btn block retreat" data-a='{"type":"battleRetreat"}'>Sound the retreat <small>lose the field, keep the army: about ${b.retreatCost}% more men lost, then fall back to your nearest province</small></button>`;
  $app.innerHTML = hud() + `<div class="battle"><div class="bar"><div><h3>Battle near ${esc(b.locName)}</h3><div class="sub">${b.attacking ? 'You attack' : 'You are attacked'} · round ${Math.min(b.round + 1, b.maxRounds)} of ${b.rounds}${b.night ? ' (night)' : ''} · ${tod}</div></div></div>
    <div id="fieldwrap"></div>
    <div class="bbody">
      <div class="vs"><div><small>Yours${b.present ? '' : ' · ' + esc(b.yourGeneral)}</small><b>${n(b.men.mine)}</b> men</div><div><small>${esc(b.enemy)}</small><b>about ${n(b.men.theirs)}</b> men</div></div>
      <p class="note">${esc(b.enemyGeneralText)}</p>
      ${result}
      ${b.over ? '' : `<div class="chips">${chips.map(([id, l, o]) => `<button class="bchip ${bChip === id ? 'on' : ''}" data-act="bchip" data-chip="${id}">${l} <em>${esc(o)}</em></button>`).join('')}</div>${panel}`}
      ${cohCard}
      ${b.log.length ? `<div class="blog">${b.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : ''}
      ${controls}
      ${b.over ? '' : `<details class="guide"><summary>How battle works</summary>
        <p>The field has three sectors: left, centre, right. Tap a chip below the field to give that sector, the reserve, the horse or yourself an order, then sound the trumpets: one round is about an hour.</p>
        <p><b>Hold</b> braces: a charge breaks on it. <b>Advance</b> closes in, and pushes once in contact. <b>Pila</b> is a javelin volley, best just before contact (two per cohort). <b>Charge</b> wins against a tired or changing line but tires your men fast. <b>Relieve</b> sends the next line forward fresh. <b>Fall back</b> gives ground and loses less.</p>
        <p>Armies break from fear, not deaths: watch morale. Two broken sectors and the whole army runs. Fresh lines and relief keep a sector standing.</p>
        <p>The <b>reserve</b> can be sent behind one sector, once. The <b>horse</b> screens a flank, charges it, or runs down a broken line. ${b.present ? '<b>You</b> can ride to a sector to steady it (a small risk to your life), rally a broken one once, call across the lines, or try a ruse.' : 'Your general commands here; you are not on this field.'}</p>
        <p>At dusk you choose to fight on or break off. If it goes badly, <b>sound the retreat</b>: you lose the field, not the army.</p></details>`}
    </div></div>`;
  field.attach(document.getElementById('fieldwrap'));
  field.update(b, bSel, animate);
}
