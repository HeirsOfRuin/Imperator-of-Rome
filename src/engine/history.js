import { GROUP_OF_PROVINCE } from '../data/world.js';
import { streamFor } from './rng.js';
import { legionName } from './core.js';
import { adjustStanding, standing, treatyBetween } from './diplomacy.js';
import { CONFIG } from './config.js';
import { ITALY, PROV, distance } from './graph.js';
import { levyLegion, log, makeArmy, newFaction, newLegion, ownedLegions, ownedProvinces, takeLegion } from './core.js';
import { loyalty } from './world.js';
import { rome } from './rome.js';

export function scheduleSpawns(s) {
  const r = streamFor(s.seed, 0, 'schedule');
  s.spawnAt = [];
  const windows = [[1, 5], [5, 10], [10, 15]]; // Acts I-III (calendar windows)
  for (const [a, b] of windows) {
    let n = Math.floor(s.diff.procPerAct);
    if (r.chance(s.diff.procPerAct - n)) n++;
    for (let i = 0; i < n; i++) s.spawnAt.push(r.range(a, b));
  }
  s.minorSkip = {};
  for (const k of ['vindex', 'macer', 'nymphidius', 'capito', 'albinus']) s.minorSkip[k] = r.chance(s.diff.minorStandAside);
}

export function spawnFaction(s, spec, provinces, legionFilter) {
  const F = newFaction(s, { ...spec, acclaimed: spec.acclaimed ?? true, rebel: true });
  for (const e of s.pendingEnmity || []) if (e === F.id) adjustStanding(s, F.id, 'player', -30);
  if (F.kind === 'hist') { for (const k in F.stats) F.stats[k] = Math.min(7, F.stats[k] + s.diff.rivalStat); F.treasury *= s.diff.rivalFunds; F.legit += 3 * s.diff.rivalStat; }
  for (const pid of provinces) {
    const P = s.prov[pid];
    if (P.owner === 'state') { P.owner = F.id; }
    for (const l of Object.values(s.legions)) {
      if (l.loc === pid && l.owner === 'state' && !l.army && (!legionFilter || legionFilter(l))) takeLegion(s, l, F.id, Math.min(82, 62 + (F.kind === 'hist' ? s.diff.rivalLoyalty : 0)));
    }
  }
  return F;
}

// Where a historical claimant rises: his own province if it is free, else the
// nearest neutral province to it. He always rises (the four reach the last act).
export function claimantBase(s, home) {
  if (s.prov[home].owner === 'state') return home;
  const free = Object.values(s.prov).filter((p) => p.owner === 'state' && !ITALY.includes(p.id));
  free.sort((a, b) => distance(home, a.id) - distance(home, b.id));
  return free[0]?.id || home;
}

export function history(s) {
  const t = s.turn, r = s.R.events;
  const ok = (pid) => s.prov[pid].owner === 'state';
  if (t === 0 && !s.minorSkip.vindex && ok('LUG')) {
    const V = spawnFaction(s, { id: 'vindex', kind: 'minor', road: 'charisma', stats: { gratia: 4, auct: 3, opes: 2, virtus: 1 }, legit: 30, treasury: 300, base: 'LUG', allies: ['galba'] }, ['LUG']);
    for (let i = 0; i < 3; i++) newLegion(s, { station: 'LUG', group: 'gaul', men: 5000, exp: 0.45, owner: V.id, loyalty: 65, levy: true });
    log(s, 'vindex rises', 'LUG', 'Julius Vindex, governor of Lugdunensis, raises the Gauls against Nero.');
  }
  if (t === 1) {
    const base = claimantBase(s, 'TAR');
    spawnFaction(s, { id: 'galba', kind: 'hist', road: 'politics', stats: { auct: 5, opes: 3, virtus: 2, gratia: 1 }, legit: 48, treasury: 500, base, anchored: true, target: 'rome', stingy: true, allies: ['vindex'] }, [base, 'LUS'].filter(ok));
    log(s, 'galba proclaimed', base, `At ${PROV[base].name}, the old governor Servius Sulpicius Galba lets his men hail him: legate of the Senate and People, he says, not yet emperor.`);
    const xg = s.legions['X-Gem'];
    if (xg && xg.owner === 'state' && !xg.army) { xg.loc = base; xg.station = base; takeLegion(s, xg, 'galba', 60); }
  }
  if (t === 2 && s.factions.vindex?.alive) {
    // Vesontio: the Upper German legions march on Vindex if they are the state's
    const legs = Object.values(s.legions).filter((l) => l.loc === 'GSU' && l.owner === 'state' && !l.army).slice(0, 2);
    if (legs.length) makeArmy(s, 'state', 'GSU', legs.map((l) => l.id), 'LUG');
  }
  if (t === 2 && !s.noMacer && !s.minorSkip.macer && ok('AFR')) {
    spawnFaction(s, { id: 'macer', kind: 'minor', road: 'wealth', stats: { opes: 3, virtus: 2, auct: 2, gratia: 2 }, legit: 22, treasury: 400, base: 'AFR' }, ['AFR']);
  }
  if (t === 3) {
    if (s.factions.galba?.alive) levyLegion(s, s.factions.galba, s.factions.galba.base, 'VII-Galb');
    if (s.factions.macer?.alive) levyLegion(s, s.factions.macer, 'AFR', 'I-Macr');
    // Nero dies. The Senate recognises the most legitimate proclaimed claimant.
    s.factions.state.name = 'the Senate';
    log(s, 'nero dies', 'ROM', 'Nero is dead. Abandoned by the Praetorians, he took his own life outside Rome. The Senate rules, for now.');
    for (const l of Object.values(s.legions)) if (l.owner === 'state') l.loyalty -= 12;
    const cands = Object.values(s.factions).filter((f) => f.alive && f.acclaimed && f.kind !== 'state');
    cands.sort((a, b) => b.legit - a.legit);
    if (cands[0]) s.emperor = cands[0].id;
  }
  if (t === 4) {
    const iii = s.legions['III-Gall'];
    if (iii && iii.owner === 'state' && !iii.army && ok('SYR') && ok('MOE')) { iii.loc = 'MOE'; iii.station = 'MOE'; iii.group = 'danube'; }
  }
  if (t === 6 && !s.minorSkip.nymphidius && ok('ROM') && r.chance(0.5)) {
    const N = spawnFaction(s, { id: 'nymphidius', kind: 'minor', road: 'wealth', stats: { opes: 3, gratia: 2, auct: 1, virtus: 1 }, legit: 15, treasury: 300, base: 'ROM' }, ['ROM']);
    void N;
  }
  if (t === 7 && !s.minorSkip.capito && ok('GIN') && r.chance(s.diff.leaderBias ? 0.6 : 0.4)) {
    spawnFaction(s, { id: 'capito', kind: 'minor', road: 'military', stats: { virtus: 3, opes: 2, auct: 2, gratia: 1 }, legit: 20, treasury: 300, base: 'GIN' }, ['GIN'], (l) => r.chance(0.6));
  }
  if (t === 10) {
    // Vitellius on the Rhine
    const base = claimantBase(s, 'GIN');
    {
      const V = spawnFaction(s, { id: 'vitellius', kind: 'hist', road: 'wealth', stats: { opes: 4, virtus: 1, auct: 3, gratia: 3 }, legit: 35, treasury: 700, base, anchored: true, target: 'rome' }, [base]);
      if (ok('GSU')) for (const l of Object.values(s.legions)) if (l.loc === 'GSU' && l.owner === 'state' && !l.army) takeLegion(s, l, V.id, 60);
      if (!ownedLegions(s, V.id).length) newLegion(s, { station: base, group: 'rhine', exp: 0.55, owner: V.id, loyalty: 60, levy: true });
    }
    // Otho strikes in Rome, or from Lusitania
    const G = s.factions.galba;
    const romeOwner = s.prov.ROM.owner;
    let O;
    if ((romeOwner === 'galba' || romeOwner === 'state')) {
      const galbaInRome = Object.values(s.armies).some((A) => A.owner === 'galba' && A.loc === 'ROM' && A.legions.length);
      const base = galbaInRome ? 'CMP' : 'ROM';
      O = newFaction(s, { id: 'otho', kind: 'hist', road: 'charisma', stats: { gratia: 5, auct: 2, opes: 1, virtus: 2 }, legit: 30, treasury: 400, base, anchored: true, target: 'rome', acclaimed: true, rebel: true });
      const pr = s.legions.PRAET;
      if (pr && !pr.army && (pr.owner === 'state' || (pr.owner === 'galba' && pr.loyalty < 60))) {
        takeLegion(s, pr, 'otho', 60); pr.loc = base;
        if (!galbaInRome) s.prov.ROM.owner = 'otho';
      }
      if (s.prov[base].owner === 'state') s.prov[base].owner = 'otho';
      newLegion(s, { id: 'I-Adiut', station: 'CMP', loc: base, group: 'italy', exp: 0.7, owner: 'otho', loyalty: 65, levy: true });
      if (G && G.alive && s.emperor === 'galba' && s.prov.ROM.owner === 'otho') s.emperor = null;
    } else {
      const b2 = claimantBase(s, 'LUS');
      O = spawnFaction(s, { id: 'otho', kind: 'hist', road: 'charisma', stats: { gratia: 5, auct: 2, opes: 1, virtus: 2 }, legit: 30, treasury: 300, base: b2, anchored: true, target: 'rome' }, [b2]);
    }
    if (O && !ownedLegions(s, O.id).length) newLegion(s, { station: O.base, group: 'italy', exp: 0.55, owner: O.id, loyalty: 60, levy: true });
    if (G) delete G.allies.otho;
  }
  if (t === 11) s.threat.danube += 30; // Roxolani
  if (t === 12 && !s.minorSkip.albinus && ok('MCA')) {
    spawnFaction(s, { id: 'albinus', kind: 'minor', road: 'politics', stats: { auct: 3, opes: 2, virtus: 2, gratia: 2 }, legit: 15, treasury: 250, base: 'MCA' }, ['MCA', 'MTI'].filter(ok));
  }
  if (t === 14) s.threat.britain += 35; // Brigantes
  if (t === CONFIG.actIVTurn) {
    const base = claimantBase(s, 'JUD');
    const V = spawnFaction(s, { id: 'vespasian', kind: 'hist', road: 'military', stats: { virtus: 4, opes: 3, auct: 3, gratia: 3 }, legit: 40, treasury: 800, base, anchored: true, target: 'rome', patience: 6 }, [base, 'SYR', 'EGY'].filter(ok));
    if (!ownedLegions(s, V.id).length) { newLegion(s, { station: base, group: 'east', owner: V.id, loyalty: 60 }); newLegion(s, { station: base, group: 'east', owner: V.id, loyalty: 60 }); }
    openActIV(s);
  }
  if (t === CONFIG.actIVTurn + 1) {
    const V = s.factions.vespasian;
    for (const pid of ['MOE', 'PAN', 'DAL']) if (V?.alive && ok(pid) && r.chance(0.7)) {
      s.prov[pid].owner = V.id;
      for (const l of Object.values(s.legions)) if (l.loc === pid && l.owner === 'state' && !l.army) takeLegion(s, l, V.id, 55);
    }
    const ginLegs = Object.values(s.legions).filter((l) => l.loc === 'GIN').length;
    s.threat.rhine += ginLegs < 2 ? 50 : 20; // Civilis
  }
  if (t === 22) s.threat.africa += 30; // Garamantes
  if (t === 11) log(s, 'roxolani', 'MOE', 'The Roxolani cross the frozen Danube into Moesia.');
  if (t === 14) log(s, 'brigantes', 'BRI', 'In Britain, Venutius leads the Brigantes in revolt.');
  if (t === CONFIG.actIVTurn + 1) log(s, 'civilis', 'GIN', 'On the Rhine, the Batavian prince Julius Civilis stirs his people.');
  if (t === 22) log(s, 'garamantes', 'AFR', 'The Garamantes raid the coast of Africa.');
  // announce claimants who rose this month
  const NEWS = {
    macer: 'In Africa, Clodius Macer, legate of III Augusta, holds back the grain ships and raises a legion of his own.',
    nymphidius: 'In Rome, the Praetorian prefect Nymphidius Sabinus reaches for the throne.',
    capito: 'On the lower Rhine, Fonteius Capito is said to want the purple for himself.',
    vitellius: 'On the Rhine, the legions refuse their oath and hail Aulus Vitellius emperor.',
    otho: 'Marcus Salvius Otho, once Nero\'s friend, buys the Praetorians and claims the throne.',
    albinus: 'In Mauretania, Lucceius Albinus takes the royal style, men say.',
    vespasian: 'At Alexandria, the legions of the East hail Titus Flavius Vespasianus emperor. The last act begins.',
  };
  for (const f of Object.values(s.factions)) if (f.bornTurn === s.turn && NEWS[f.id] && !f.announced) { f.announced = true; log(s, `${f.id} rises`, f.base, NEWS[f.id]); }
  // in the final act the surviving claimants keep drawing men to their cause
  if (s.actIVOpen && t > CONFIG.actIVTurn && (t - CONFIG.actIVTurn) % s.diff.rivalLevyEvery === 0) {
    for (const f of Object.values(s.factions)) {
      if (!f.alive || f.kind !== 'hist') continue;
      const at = s.prov[f.base]?.owner === f.id ? f.base : ownedProvinces(s, f.id)[0]?.id;
      if (at) newLegion(s, { station: at, group: GROUP_OF_PROVINCE[at] || 'italy', exp: 0.6, owner: f.id, loyalty: 62, levy: true });
    }
  }
}

export function openActIV(s) {
  s.actIVOpen = true;
  s.act = 4;
  s.stats.legionsTurn16 = ownedLegions(s, 'player').length;
  // non-historical rivals fold into the strongest claimant within reach
  const claimants = Object.values(s.factions).filter((f) => f.alive && (f.kind === 'hist' || (f.kind === 'player' && f.acclaimed)));
  for (const f of Object.values(s.factions)) {
    if (!f.alive || (f.kind !== 'minor' && f.kind !== 'proc')) continue;
    const base = f.base || ownedProvinces(s, f.id)[0]?.id;
    let best = null, bestScore = -Infinity;
    for (const c of claimants) {
      const cb = c.leaderArmy && s.armies[c.leaderArmy] ? s.armies[c.leaderArmy].loc : c.base;
      const d = base && cb ? distance(base, cb) : 9;
      if (d > 3) continue;
      const t = s.opts.noDiplomacy ? null : treatyBetween(s, f.id, c.id);
      const score = c.legit + ownedLegions(s, c.id).length * 6 - d * 4 + (c.kind === 'player' ? c.stats.auct + c.stats.gratia : 0)
        + (s.opts.noDiplomacy ? 0 : standing(s, f.id, c.id) / 5 + (t && t.type === 'alliance' ? 20 : 0));
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const to = best ? best.id : 'state';
    for (const l of ownedLegions(s, f.id)) takeLegion(s, l, to, 50);
    for (const p of ownedProvinces(s, f.id)) p.owner = to;
    for (const A of Object.values(s.armies)) if (A.owner === f.id) delete s.armies[A.id];
    f.alive = false;
    s.stats.minorFolded++;
    if (to === 'player') s.stats.foldedToPlayer = (s.stats.foldedToPlayer || 0) + 1;
  }
  for (const f of Object.values(s.factions)) if (f.kind === 'hist') f.anchored = false;
}

export function spawnProcedural(s) {
  const r = s.R.spawn;
  // a legate whose men will follow him: a legion with weak loyalty, not in a leader's army
  const cands = Object.values(s.legions).filter((l) => !l.army && l.loyalty < 62 && l.id !== 'PRAET' &&
    !(s.factions[l.owner].kind === 'hist' && s.factions[l.owner].anchored && ownedLegions(s, l.owner).length <= 1) &&
    !(l.owner === 'player' && ownedLegions(s, 'player').length <= 1));
  if (!cands.length) return;
  const l = r.pick(cands);
  const prev = s.factions[l.owner];
  const roads = ['wealth', 'military', 'politics', 'charisma'];
  const F = newFaction(s, {
    kind: 'proc', road: r.pick(roads), acclaimed: true, rebel: true, base: l.loc, legit: 12 + r.int(15), treasury: 150 + r.int(250),
    stats: { opes: r.range(1, 4), virtus: r.range(1, 4), auct: r.range(1, 4), gratia: r.range(1, 4) },
  });
  takeLegion(s, l, F.id, 65);
  const more = Object.values(s.legions).find((o) => o.loc === l.loc && o.owner === prev.id && !o.army && o.loyalty < 50 && o.id !== 'PRAET');
  if (more && r.chance(0.5)) takeLegion(s, more, F.id, 60);
  const P = s.prov[l.loc];
  if (P.owner === prev.id || P.owner === 'state') { if (!(prev.kind === 'player' && ownedLegions(s, 'player').some((x) => x.loc === l.loc))) P.owner = F.id; }
  s.stats.procSpawned++;
  log(s, `proc ${F.id} rises at ${l.loc} from ${prev.id}`, l.loc, prev.kind === 'player' ? `${F.name}, legate of ${legionName(l)}, turns against you and claims the purple.` : `${F.name}, legate of ${legionName(l)}, claims the purple in ${PROV[l.loc].name}.`);
  if (prev.kind === 'player') s.stats.ownLegateRevolts = (s.stats.ownLegateRevolts || 0) + 1;
}
