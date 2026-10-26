import { senateTurn, initSenate } from './senate.js';
import { foreignTurn, initForeign } from './foreign.js';
import { tradeTurn, initTrade } from './trade.js';
import { buildingsTurn, governorsTurn } from './buildings.js';
import { PROVINCES, LEGIONS, FRONTIERS, BACKGROUND } from '../data/world.js';
const BACKGROUND_STAGES = BACKGROUND.map((b) => b.stage);
import { streamFor } from './rng.js';
import { CONFIG, DIFFICULTY } from './config.js';
import { buildBackground, newFaction, newLegion, rngs, townsFor, takeLegion, makeArmy } from './core.js';
import { fight, fieldBattle } from './combat.js';
import { history, scheduleSpawns, spawnProcedural } from './history.js';
import { economy, followers, frontiers, loyalty, mutinies, raids } from './world.js';
import { factionTurn } from './ai.js';
import { movement } from './movement.js';
import { openingPages, storyTurn } from './story.js';
import { checks, hold, rome } from './rome.js';
import { botDiplomacy, diplomacyTurn, initDiplomacy, adjustStanding, pruneTreaties } from './diplomacy.js';

export function init(seed, opts) {
  const diff = DIFFICULTY[opts.difficulty || 'centurion'];
  const s = {
    seed, turn: 0, opts, diff, nextId: 1,
    prov: {}, legions: {}, factions: {}, armies: {},
    threat: {}, breach: {}, emperor: null, romeUnrest: 20, act: 1, actIVOpen: false,
    stats: { smallFights: 0, largeFights: 0, pSmall: 0, pLarge: 0, buys: 0, negs: 0, negOK: 0, bypasses: 0,
      letters: 0, fightsWon: 0, fightsLost: 0, gainedBy: { buy: 0, negotiate: 0, fight: 0, letter: 0 },
      anchorSaves: 0, histZeroBeforeIV: 0, minorFolded: 0, procSpawned: 0, mutinies: 0, breaches: 0,
      romeTaken: 0, tookRome: false, lostRome: false, maxLegions: 0, debtPeak: 0, legionsTurn16: 0 },
    outcome: null, events: [], ledger: [], pending: [], dispatches: [],
  };
  for (const p of PROVINCES) s.prov[p.id] = { id: p.id, owner: 'state', aux: p.aux, unrest: 10, breachUntil: -1, standAside: {}, towns: townsFor(p) };
  for (const k in FRONTIERS) s.threat[k] = 30;
  newFaction(s, { id: 'state', kind: 'state', name: 'Nero', legit: 50, treasury: 1e9 });
  newFaction(s, { id: 'barbarians', kind: 'barbarian', legit: 0, treasury: 0 }).alive = false;
  for (const l of LEGIONS) newLegion(s, { ...l, owner: 'state', loyalty: 60, exp: 1.0 });
  newLegion(s, { id: 'PRAET', station: 'ROM', group: 'italy', men: 9000, exp: 0.9, owner: 'state', loyalty: 55, payMult: CONFIG.praetorianPayMult });

  // the player: a legate of one legion in the start province
  const bg = buildBackground(opts.road, opts.background);
  const P = newFaction(s, {
    id: 'player', kind: 'player', road: opts.road, stats: bg.stats, legit: bg.legit,
    treasury: (150 + bg.stats.opes * 120) * diff.startFunds, comrades: bg.comrades, base: opts.start,
    allowed: opts.allowed || null, declareAt: opts.declareAt ?? 4, target: 'rome',
  });
  P.enemies = bg.enemies; P.friends = bg.friends; P.suspicion = 0; P.ownsProvince = false;
  P.credit = bg.stats.opes * CONFIG.creditPerOpes + (bg.friends.includes('banker') ? 300 : 0);
  if (bg.friends.includes('senator')) P.legit += 5;
  const here = Object.values(s.legions).filter((l) => l.station === opts.start && l.owner === 'state');
  const mine = here[streamFor(seed, 0, 'start').int(here.length)];
  mine.owner = 'player'; mine.loyalty = 60 + bg.stats.gratia * 3;
  if (opts.start === 'AFR') s.noMacer = true; // you are the legate Clodius Macer would have been
  initDiplomacy(s);
  initSenate(s); initForeign(s); initTrade(s);
  // your background's enemies: men among the future claimants who remember you
  const enemyPool = ['galba', 'otho', 'vitellius', 'vespasian'];
  const er = streamFor(seed, 0, 'enemies');
  for (let i = 0; i < (bg.enemies || 0); i++) s.pendingEnmity = [...(s.pendingEnmity || []), enemyPool[er.int(4)]];
  s.R = rngs(s);
  scheduleSpawns(s);
  return s;
}

export function step(s) {
  s.R = rngs(s);
  history(s);
  for (const t of s.spawnAt) if (t === s.turn && !s.actIVOpen) spawnProcedural(s);
  economy(s);
  buildingsTurn(s);
  governorsTurn(s);
  loyalty(s);
  frontiers(s);
  raids(s);
  for (const F of Object.values(s.factions)) if (F.kind !== "state" && F.alive) factionTurn(s, F);
  senateTurn(s);
  foreignTurn(s);
  diplomacyTurn(s);
  tradeTurn(s);
  if (!s.opts.human && s.factions.player.alive && s.factions.player.ownsProvince) botDiplomacy(s, s.factions.player);
  movement(s);
  mutinies(s);
  followers(s);
  rome(s);
  hold(s);
  checks(s);
  for (const l of Object.values(s.legions)) l.loyalty = Math.max(0, Math.min(100, l.loyalty));
  if (s.emperor && !s.factions[s.emperor]?.alive) s.emperor = null;
  pruneTreaties(s);
  s.turn++;
  storyTurn(s);
  return s;
}

export function play(seed, opts) {
  const s = init(seed, opts);
  while (!s.outcome && s.turn < CONFIG.maxTurns) step(s);
  if (!s.outcome) s.outcome = { win: false, cause: 'out of time', turn: s.turn };
  return s;
}

// A human's new game. opts: { seed, difficulty, start, background: {stage: optionId}, road (quick start), name }
// Your road is not chosen: it is the stat your life has made strongest.
export function newGame(opts) {
  const seed = (opts.seed >>> 0) || 1;
  const bg = buildBackground(opts.road || 'politics', opts.background);
  const order = ['auct', 'gratia', 'opes', 'virtus'];
  const roadOf = { opes: 'wealth', virtus: 'military', auct: 'politics', gratia: 'charisma' };
  const top = order.reduce((a, k) => (bg.stats[k] > bg.stats[a] ? k : a), order[0]);
  const s = init(seed, { ...opts, road: roadOf[top], background: Object.fromEntries(BACKGROUND_STAGES.map((st, i) => [st, bg.chosen[i]])), human: true });
  s.factions.player.name = opts.name || 'You';
  s.dispatches.push({ t: 0, loc: opts.start, text: 'March, AD 68. Word comes from Gaul: Julius Vindex, governor of Lugdunensis, has risen against Nero.' });
  s.story = opts.skipStory ? [] : openingPages(s); s.lastAct = 1;
  if (opts.guide) s.tutorial = { step: 0 };
  return s;
}

// Calibration jump: Second Bedriacum, October AD 69. You command the Danube
// legions (Antonius Primus' role) against Vitellius' army before Cremona.
export function bedriacum(opts = {}) {
  const s = newGame({ seed: opts.seed || 69, difficulty: opts.difficulty || 'centurion', start: 'PAN', road: opts.road || 'military', name: opts.name, skipStory: true });
  s.turn = 19; s.lastAct = 4; s.neroPage = true; s.factions.player.generals = [];
  const P = s.factions.player;
  P.ownsProvince = true; P.rebel = true; P.acclaimed = true; P.legit = 40; P.treasury = 900;
  for (const pid of ['PAN', 'DAL', 'MOE', 'NIT']) s.prov[pid].owner = 'player';
  const mine = ['XIII-Gem', 'VII-Claud', 'VIII-Aug', 'III-Gall', 'XI-Claud'];
  for (const id of Object.values(s.legions).filter((l) => l.owner === 'player').map((l) => l.id)) if (!mine.includes(id)) takeLegion(s, s.legions[id], 'state', 50);
  for (const id of mine) { const l = s.legions[id]; takeLegion(s, l, 'player', 68); l.loc = 'NIT'; l.men = 4400 + (id.length * 37) % 400; }
  const A = makeArmy(s, 'player', 'NIT', mine); A.from = 'PAN'; P.leaderArmy = A.id;
  const V = newFaction(s, { id: 'vitellius', kind: 'hist', road: 'wealth', stats: { opes: 4, virtus: 2, auct: 3, gratia: 3 }, legit: 35, treasury: 800, base: 'GIN', acclaimed: true, rebel: true });
  const theirs = ['V-Alaud', 'XXI-Rap', 'XXII-Prim', 'I-Ital', 'XVI-Gall'];
  for (const id of theirs) { const l = s.legions[id]; takeLegion(s, l, 'vitellius', 64); l.loc = 'NIT'; l.men = 4200 + (id.length * 53) % 500; }
  const VA = makeArmy(s, 'vitellius', 'NIT', theirs); V.leaderArmy = VA.id;
  s.prov.GIN.owner = 'vitellius'; s.prov.ETR.owner = 'vitellius'; s.prov.ROM.owner = 'vitellius'; s.emperor = 'vitellius';
  s.dispatches.push({ t: 19, loc: 'NIT', text: 'October AD 69. Before Cremona, on the Via Postumia, the Vitellian legions turn to fight. Their commander is impetuous. Night will fall before it is done.' });
  fieldBattle(s, P, A, VA, true);
  return s;
}
