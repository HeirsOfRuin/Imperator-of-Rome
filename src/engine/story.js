// The story: pages that tell you where you are (the opening, each new act,
// Nero's death), and things that happen to you that need an answer. Every
// answer moves a number the rest of the engine reads; nothing here is only
// words. Human games only: the bot and the measurements never see it.
import { PROV, ADJ, isWinter, distance } from './graph.js';
import { streamFor } from './rng.js';
import { actOf, legionName, money, ownedLegions, ownedProvinces, legateName, newLegion, strengthOf, takeLegion } from './core.js';
import { addFavour, favour } from './senate.js';
import { goodsOwned } from './trade.js';
import { initForeign } from './foreign.js';
import { adjustStanding } from './diplomacy.js';
import { PRODUCES } from '../data/powers.js';
import { CAPITALS } from '../data/seeds.js';
import { addGeneral, MAX_GENERALS } from './generals.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const flag = (s, k, v = true) => { s.flags = { ...(s.flags || {}), [k]: v }; };
const flagged = (s, k) => (s.flags || {})[k];
const unflag = (s, k) => { if (s.flags) delete s.flags[k]; };
const coastal = (pid) => ADJ[pid].some((e) => e.kind === 'sea');
const histRivals = (s) => Object.values(s.factions).filter((f) => f.alive && f.kind === 'hist');
const loy = (l, d) => { l.loyalty = clamp(l.loyalty + d, 0, 100); };
const legit = (P, d) => { P.legit = clamp(P.legit + d, 0, 100); };
const unrest = (q, d) => { q.unrest = clamp(q.unrest + d, 0, 100); };
const rivalsOf = (s) => Object.values(s.factions).filter((f) => f.alive && ['hist', 'minor', 'proc'].includes(f.kind));

// ---------------------------------------------------------------- pages

export const SERVED = { rhine: 'on the Rhine', danube: 'on the Danube', east: 'in the East', britain: 'in Britain', italy: 'in Italy', africa: 'in Africa', spain: 'in Spain', gaul: 'in Gaul' };

const ROAD_LINE = {
  wealth: 'You have money and know what it buys. Most men in this war can be bought; the trick is staying bought.',
  military: 'You know how to fight, and the men know that you know. Beaten legions often change sides.',
  politics: 'You know the law and the Senate. Letters, decrees and oaths will open gates other men must storm.',
  charisma: 'Men like you. Legions that would never take a bribe will listen when you speak to them.',
};

export function openingPages(s) {
  const P = s.factions.player;
  const mine = ownedLegions(s, 'player')[0];
  const others = Object.values(s.legions).filter((l) => l.loc === P.base && l.owner !== 'player').length;
  return [
    { title: 'March, AD 68', kind: 'world', text: [
      'Nero has ruled for fourteen years. He has killed his mother, his wife, his tutor Seneca and his best general, Corbulo. Since the conspiracy of Piso three years ago, men of rank sleep badly.',
      'He has spent the treasury on his Golden House and his tour of Greece, and the provinces pay for it. The legions on the frontiers have not seen him in years. They are loyal to their legates, their eagles and their pay, roughly in that order.',
      'Word has come from Gaul: Julius Vindex, governor of Lugdunensis, is about to rise. Before this is over, four men will hold the throne in a single year. None of them is you. Yet.',
    ] },
    { title: 'How this war is won', kind: 'guide', text: [
      'Act I: win your own province. The other legions there, then the governor. Buy them, talk to them, or fight them. Do it quietly: if Rome hears too much, you are recalled, and recall means death.',
      'Act II: the province is yours, with its treasury. Take your neighbours, raise legions, choose your moment to be hailed imperator.',
      'Act III: march on Rome. Act IV opens in July 69, when Vespasian is proclaimed in the East: from then on only the four historical claimants stand against you.',
      `Take Rome, be recognised, and hold it ${s.diff.hold} months. You can get there by money, by the sword, by the Senate or by the loyalty of your men.`,
      'Legions are not everything. The Senate confers the throne and can outlaw a claimant; the peoples beyond the frontiers can be paid to keep quiet or to rise; trade brings money and the metal, horses and grain an army needs. All of it is in the Powers tab.',
    ] },
    { title: P.name, kind: 'you', text: [
      `You are legate of ${legionName(mine)} in ${PROV[P.base].name}, a man the histories will not mention unless you make them.`,
      ROAD_LINE[P.road] + (P.comrades ? ` You served as a tribune ${SERVED[P.comrades] || 'with ' + P.comrades}; those legions remember you.` : ''),
      others ? `There ${others === 1 ? 'is one other legion' : `are ${others} other legions`} in ${PROV[P.base].name}, and a governor loyal to Nero. Start in the Army tab: one approach a month.` : `Your legion is the only one in ${PROV[P.base].name}. Only the governor stands in your way. Start in the Army tab.`,
    ] },
  ];
}

const ACT_PAGES = {
  2: (s) => ({ title: 'Act II · The province is yours', kind: 'act', text: [
    `${PROV[s.factions.player.base].name} is yours, and its treasury with it. From now on you pay your legions yourself. Legions in their own province cost less: the province feeds them.`,
    'One of your legates has sworn to you. Give him legions and he can command a second army (Army tab).',
    'Take neighbouring provinces for their revenue, raise legions, and decide when to be hailed imperator. Once hailed, there is no going back.',
  ] }),
  3: (s) => ({ title: 'Act III · Imperator', kind: 'act', text: [
    'Your legions have hailed you. Every claimant now treats you as one of them, and the promises you made fall due sooner.',
    `Rome is the prize. Take it with no enemy legions in Etruria or Campania and the Senate will recognise you; then hold it ${s.diff.hold} months.`,
  ] }),
  4: () => ({ title: 'Act IV · July, AD 69', kind: 'act', text: [
    'In Alexandria the prefect Tiberius Alexander has made his legions swear to Titus Flavius Vespasianus. Judaea and Syria follow. The East has chosen.',
    'The lesser men are finished. Only Galba, Otho, Vitellius and Vespasian, or what is left of them, stand between you and the throne.',
  ] }),
};

// When an emperor is recognised, and when one of the four falls. The engine's
// history is not Tacitus': the page says what happened in yours.
const EMPEROR_LINE = {
  galba: 'Servius Sulpicius Galba, seventy-two, of the oldest nobility, is emperor. He is stiff, honest after his fashion, and mean: he has refused the Praetorians their donative. "I choose soldiers," he says; "I do not buy them."',
  otho: 'Marcus Salvius Otho, once Nero\'s friend and the husband of Poppaea, is emperor. The Praetorians made him; they will expect to be paid.',
  vitellius: 'Aulus Vitellius, son of a three-times consul, is emperor. The Rhine legions made him, and they are in Italy now, eating it.',
  vespasian: 'Titus Flavius Vespasianus, sixty, a muleteer\'s grandson and the conqueror of the Isle of Wight, is emperor. He has two grown sons, which no emperor has had for a long time.',
};
const EPITAPH = {
  galba: 'Galba is dead. Tacitus will say of him that everyone thought him capable of ruling, until he ruled.',
  otho: 'Otho is dead. A man who lived badly, men say, and ended well.',
  vitellius: 'Vitellius is dead. He was, men say, a man who could not be emperor and would not be anything less.',
  vespasian: 'Vespasian is dead. The East will need a new master.',
};

const NERO_PAGE = { title: 'June, AD 68 · Nero is dead', kind: 'world', text: [
  'Declared a public enemy by the Senate and deserted by his guard, Nero fled Rome and had a freedman help him drive a dagger into his throat. "What an artist dies in me," he is supposed to have said.',
  'The line of Augustus is ended. Any man with legions behind him may now think of the throne, and many do. Oaths sworn to Nero no longer bind: legions will be easier to win, and harder to keep.',
] };

// ---------------------------------------------------------------- events

const EVENTS = [
  { id: 'vindex-envoy', act: [1], when: (s) => s.turn >= 1 && s.turn <= 2 && s.factions.vindex?.alive ? {} : null,
    title: 'A man from Vindex',
    text: () => 'An envoy from Julius Vindex reaches your camp in a merchant\'s cloak. The Gauls are rising against Nero, he says; will the legate stand with them?',
    options: [
      { label: 'Send him back with friendly words', hint: 'Suspicion +10, legitimacy +2', apply: (s, P) => { P.suspicion += 10; legit(P, 2); return 'He goes back to Vindex with your good wishes and nothing else.'; } },
      { label: 'Hand him to the governor', hint: 'Suspicion −20, legitimacy −1', apply: (s, P) => { P.suspicion = Math.max(0, P.suspicion - 20); legit(P, -1); return 'The governor thanks you warmly. The envoy is crucified on the road outside the camp.'; } },
      { label: 'Say nothing to anyone', hint: 'No effect', apply: () => 'He leaves before dawn.' },
    ] },
  { id: 'nero-levy', act: [1], when: (s) => s.turn <= 2 ? {} : null,
    title: 'Orders from the palace',
    text: () => 'A courier brings orders from Nero\'s freedman Helius: the provinces are to send money for the Emperor\'s debts. The legate is to contribute from his own purse, as a mark of loyalty.',
    options: [
      { label: 'Pay it · 40k', hint: 'Suspicion −15', need: (s, P) => (P.treasury < 40 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -40, 'gift to Nero'); P.suspicion = Math.max(0, P.suspicion - 15); return 'Your loyalty is noted in Rome.'; } },
      { label: 'Lose the letter', hint: 'Suspicion +8; your legion likes it, loyalty +3', apply: (s, P) => { P.suspicion += 8; for (const l of ownedLegions(s, 'player')) loy(l, 3); return 'The men hear of it and approve.'; } },
    ] },
  { id: 'pay-day', act: [1, 2, 3, 4], cooldown: 14, when: (s, P, r) => { const l = r.pick(ownedLegions(s, 'player').filter((x) => x.loyalty < 65)); return l ? { legion: l.id } : null; },
    title: 'The centurions come',
    text: (s, P, c) => `The senior centurions of ${legionName(s.legions[c.legion])} come to your tent. The men have heard what other legions are being paid to choose a side. They want to know what they will get.`,
    options: [
      { label: 'Pay something now · 50k', hint: 'Their loyalty +8', need: (s, P) => (P.treasury < 50 ? 'Not enough money' : ''), apply: (s, P, c) => { money(s, P, -50, 'bought ' + c.legion); loy(s.legions[c.legion], 8); return 'The centurions leave satisfied.'; } },
      { label: 'Promise it · 80k in 4 months', hint: 'Loyalty +4; a debt', apply: (s, P, c) => { const l = s.legions[c.legion]; l.debt += 80; l.debtDue = l.debtDue >= 0 ? Math.min(l.debtDue, s.turn + 4) : s.turn + 4; loy(l, 4); return 'They will remember the promise, and the day it falls due.'; } },
      { label: 'Tell them to wait', hint: 'Their loyalty −5', apply: (s, P, c) => { loy(s.legions[c.legion], -5); return 'They go away muttering.'; } },
    ] },
  { id: 'astrologer', act: [1, 2, 3], when: () => ({}),
    title: 'The astrologer',
    text: () => 'A Chaldean astrologer, the kind Otho keeps about him, has cast your horoscope. The stars, he says, promise you the purple. He says it loudly, in the camp.',
    options: [
      { label: 'Keep him close; let the men hear', hint: 'Legitimacy +2, every legion +2 loyalty; in Act I, suspicion +10', apply: (s, P) => { legit(P, 2); for (const l of ownedLegions(s, 'player')) loy(l, 2); if (!P.ownsProvince) P.suspicion += 10; flag(s, 'astrologer'); return 'By evening the whole camp knows your destiny.'; } },
      { label: 'Pay him to keep quiet · 20k', hint: 'No other effect', need: (s, P) => (P.treasury < 20 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -20, 'astrologer'); return 'He takes the money. You wonder who else he will tell.'; } },
      { label: 'Throw him out', hint: 'No effect', apply: () => 'He goes, cursing you in Aramaic.' },
    ] },
  { id: 'omen', act: [1, 2, 3, 4], when: (s, P, r) => { const l = r.pick(ownedLegions(s, 'player')); return l ? { legion: l.id } : null; },
    title: 'Lightning on the parade ground',
    text: (s, P, c) => `In a summer storm, lightning strikes the eagle of ${legionName(s.legions[c.legion])} in front of the whole legion. The men stand in the rain and look at you.`,
    options: [
      { label: 'Sacrifice, and call it Jupiter\'s favour · 20k', hint: 'Every legion +3 loyalty', need: (s, P) => (P.treasury < 20 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -20, 'sacrifice'); for (const l of ownedLegions(s, 'player')) loy(l, 3); return 'The haruspex finds the liver excellent.'; } },
      { label: 'Laugh it off in front of them', hint: 'Depends on your charisma', apply: (s, P) => { const good = P.stats.gratia >= 4; for (const l of ownedLegions(s, 'player')) loy(l, good ? 2 : -3); return good ? 'They laugh with you. A good sign after all.' : 'Nobody laughs. Men make the sign against the evil eye.'; } },
    ] },
  { id: 'temple', act: [2, 3, 4], when: (s, P, r) => { const q = r.pick(ownedProvinces(s, 'player').filter((x) => PROV[x.id].rev >= 80)); return q ? { prov: q.id } : null; },
    title: 'The temple treasure',
    text: (s, P, c) => `The priests of the great temple at ${CAPITALS[c.prov] || PROV[c.prov].name} keep a treasure of votive gold. Your quaestor points out that you could borrow it. Vitellius' men did as much in Gaul.`,
    options: [
      { label: 'Borrow it, with a receipt · +150k', hint: `Unrest there +12, legitimacy −3`, apply: (s, P, c) => { money(s, P, 150, 'temple treasure'); unrest(s.prov[c.prov], 12); legit(P, -3); flag(s, 'temple', c.prov); return 'The gold is weighed out. The priests will not forget.'; } },
      { label: 'Make an offering · 30k', hint: 'Legitimacy +2, unrest there −5', need: (s, P) => (P.treasury < 30 ? 'Not enough money' : ''), apply: (s, P, c) => { money(s, P, -30, 'offering'); legit(P, 2); unrest(s.prov[c.prov], -5); return 'Your name is cut into the temple wall.'; } },
      { label: 'Leave it alone', hint: 'No effect', apply: () => 'The gold stays where it is.' },
    ] },
  { id: 'tax-embassy', act: [2, 3, 4], cooldown: 8, when: (s, P, r) => { const q = r.pick(ownedProvinces(s, 'player').filter((x) => x.unrest >= 25 || ['heavy', 'extort'].includes(x.tax))); return q ? { prov: q.id } : null; },
    title: 'An embassy of complaint',
    text: (s, P, c) => `The leading men of ${PROV[c.prov].name} have come to complain: your tax collectors are stripping the province, and there will be nothing left to collect next year.`,
    options: [
      { label: 'Hang the worst collector', hint: 'Unrest there −12, legitimacy +1', apply: (s, P, c) => { unrest(s.prov[c.prov], -12); legit(P, 1); return 'He is hanged in the forum. The others are more careful, for a while.'; } },
      { label: 'Lower the taxes', hint: 'Taxes set to light there, unrest −5', apply: (s, P, c) => { s.prov[c.prov].tax = 'light'; unrest(s.prov[c.prov], -5); return 'They go home and praise you.'; } },
      { label: 'Send them home', hint: 'Unrest there +8', apply: (s, P, c) => { unrest(s.prov[c.prov], 8); return 'They go home and talk.'; } },
    ] },
  { id: 'bandits', act: [2, 3, 4], cooldown: 8, when: (s, P, r) => { const q = r.pick(ownedProvinces(s, 'player').filter((x) => x.unrest >= 35)); return q ? { prov: q.id } : null; },
    title: 'Brigands in the hills',
    text: (s, P, c) => `Brigands hold the roads of ${PROV[c.prov].name}. Merchants will not travel, and the tax carts are robbed.`,
    options: [
      { label: 'Send cohorts after them', hint: 'Unrest there −10; a nearby legion loses 200 men', apply: (s, P, c) => { unrest(s.prov[c.prov], -10); const l = ownedLegions(s, 'player').sort((a, b) => (a.loc === c.prov ? -1 : 0) - (b.loc === c.prov ? -1 : 0))[0]; if (l) l.men = Math.max(1000, l.men - 200); return 'The heads go up on the milestones.'; } },
      { label: 'Buy them off · 30k', hint: 'Unrest there −5', need: (s, P) => (P.treasury < 30 ? 'Not enough money' : ''), apply: (s, P, c) => { money(s, P, -30, 'brigands bought off'); unrest(s.prov[c.prov], -5); return 'They take the money and move to the next province.'; } },
      { label: 'Leave it to the towns', hint: 'Unrest there +8', apply: (s, P, c) => { unrest(s.prov[c.prov], 8); return 'The roads stay closed.'; } },
    ] },
  { id: 'fever', act: [2, 3, 4], when: (s, P) => { const m = (2 + s.turn) % 12; const A = P.leaderArmy && s.armies[P.leaderArmy]; return m >= 6 && m <= 8 && A && A.legions.length ? { army: A.id } : null; },
    title: 'Fever in the camp',
    text: (s, P, c) => `Fever has broken out in the camp at ${PROV[s.armies[c.army].loc].name}, the kind that killed Vitellius' Germans by the hundred in the Vatican fields. The physicians want the army moved to higher ground.`,
    options: [
      { label: 'Move the camp; lose a month', hint: 'Your army does not march this month', apply: (s, P, c) => { const A = s.armies[c.army]; if (A) A.wait = Math.max(A.wait || 0, 1); return 'The army climbs into the hills. The fever passes.'; } },
      { label: 'March on and bury the dead', hint: 'Your army loses 5% of its men', apply: (s, P, c) => { const A = s.armies[c.army]; if (A) for (const id of A.legions) s.legions[id].men = Math.round(s.legions[id].men * 0.95); return 'You leave a line of graves behind you.'; } },
    ] },
  { id: 'marriage', act: [2, 3], when: (s, P) => (P.legit < 70 ? { name: legateName('wed' + s.seed) } : null),
    title: 'An offer of marriage',
    text: (s, P, c) => `The senator ${c.name}, who has friends in the curia and debts in the Forum, offers you his daughter in marriage. Her dowry is large; his friends are larger.`,
    options: [
      { label: 'Accept', hint: 'Dowry +100k, legitimacy +4', apply: (s, P, c) => { money(s, P, 100, 'dowry'); legit(P, 4); flag(s, 'married', c.name); return 'The wedding is quick, and well attended.'; } },
      { label: 'Decline politely', hint: 'No effect', apply: () => 'He takes it well. In public.' },
    ] },
  { id: 'deserters', act: [2, 3, 4], when: (s, P, r) => { const R = r.pick(rivalsOf(s)); const l = r.pick(ownedLegions(s, 'player')); return R && l ? { rival: R.id, legion: l.id } : null; },
    title: 'Deserters',
    text: (s, P, c) => `About four hundred men from ${s.factions[c.rival].name}'s legions come into your lines at night with their arms, complaining of their pay.`,
    options: [
      { label: 'Enrol them', dyn: (s, P, c) => `Enrol them in ${legionName(s.legions[c.legion])}`, hint: '+400 men; that legion\'s loyalty −2', apply: (s, P, c) => { const l = s.legions[c.legion]; l.men = Math.min(6000, l.men + 400); loy(l, -2); return 'They take the oath again, to you this time.'; } },
      { label: 'Make an example of them', hint: 'Every legion +1 loyalty; legitimacy +1', apply: (s, P) => { for (const l of ownedLegions(s, 'player')) loy(l, 1); legit(P, 1); return 'Your men approve. Deserters are deserters.'; } },
      { label: 'Send them home', hint: 'No effect', apply: () => 'They scatter.' },
    ] },
  { id: 'mutinous-cohort', act: [2, 3, 4], cooldown: 12, when: (s, P, r) => { const l = r.pick(ownedLegions(s, 'player').filter((x) => x.loyalty < 55)); return l ? { legion: l.id } : null; },
    title: 'A centurion is killed',
    text: (s, P, c) => `A cohort of ${legionName(s.legions[c.legion])} has stoned its centurion to death over a stolen ration of wine. The legion is waiting to see what you will do.`,
    options: [
      { label: 'Decimate the cohort', hint: 'One man in ten clubbed to death: that legion −6 loyalty, every other legion +2', apply: (s, P, c) => { for (const l of ownedLegions(s, 'player')) loy(l, l.id === c.legion ? -6 : 2); const l = s.legions[c.legion]; l.men = Math.max(1000, l.men - 50); return 'The lots are drawn. Nobody forgets it.'; } },
      { label: 'Pay and pardon · 40k', hint: 'That legion +5 loyalty', need: (s, P) => (P.treasury < 40 ? 'Not enough money' : ''), apply: (s, P, c) => { money(s, P, -40, 'bought ' + c.legion); loy(s.legions[c.legion], 5); return 'Discipline is a word for peacetime.'; } },
      { label: 'Hang the ringleaders', hint: 'That legion −2 loyalty', apply: (s, P, c) => { loy(s.legions[c.legion], -2); return 'Three men hang. The rest go back to work.'; } },
    ] },
  { id: 'veterans', act: [2, 3, 4], when: (s, P, r) => { const l = r.pick(ownedLegions(s, 'player').filter((x) => !x.levy)); const q = r.pick(ownedProvinces(s, 'player')); return l && q ? { legion: l.id, prov: q.id } : null; },
    title: 'The veterans',
    text: (s, P, c) => `Veterans of ${legionName(s.legions[c.legion])}, men with twenty-five years under the eagles, ask for their discharge and land in ${PROV[c.prov].name}.`,
    options: [
      { label: 'Settle them on public land', hint: 'That legion +6 loyalty; unrest there +6; legitimacy +1', apply: (s, P, c) => { loy(s.legions[c.legion], 6); unrest(s.prov[c.prov], 6); legit(P, 1); return 'A new colony of old soldiers. The locals are not asked.'; } },
      { label: 'Pay them off · 70k', hint: 'That legion +4 loyalty, loses 300 men', need: (s, P) => (P.treasury < 70 ? 'Not enough money' : ''), apply: (s, P, c) => { money(s, P, -70, 'veterans paid off'); const l = s.legions[c.legion]; loy(l, 4); l.men = Math.max(1000, l.men - 300); return 'They go home rich and grateful.'; } },
      { label: 'Keep them under the standards', hint: 'That legion −5 loyalty', apply: (s, P, c) => { loy(s.legions[c.legion], -5); return 'They stay, and grumble, and teach the recruits to grumble.'; } },
    ] },
  { id: 'informer', act: [3, 4], cooldown: 10, when: (s, P, r) => { const R = r.pick(rivalsOf(s)); const l = r.pick(ownedLegions(s, 'player')); return R && l ? { rival: R.id, legion: l.id } : null; },
    title: 'An informer',
    text: (s, P, c) => `A freedman swears that a tribune of ${legionName(s.legions[c.legion])} has been writing to ${s.factions[c.rival].name}. He has a letter, or says he has.`,
    options: [
      { label: 'Execute the tribune', hint: 'That legion −3 loyalty; every other legion +1', apply: (s, P, c) => { for (const l of ownedLegions(s, 'player')) loy(l, l.id === c.legion ? -3 : 1); return 'Whether he was guilty, nobody now will know.'; } },
      { label: 'Have him watched · 30k', hint: 'That legion +2 loyalty', need: (s, P) => (P.treasury < 30 ? 'Not enough money' : ''), apply: (s, P, c) => { money(s, P, -30, 'informers'); loy(s.legions[c.legion], 2); return 'The letters stop.'; } },
      { label: 'Ignore it', hint: 'A risk: that legion may lose 10 loyalty', apply: (s, P, c, r) => { flag(s, 'tribune', { legion: c.legion, rival: c.rival }); if (r.chance(0.5)) { loy(s.legions[c.legion], -10); return 'The tribune was what the freedman said. Half his legion now thinks as he does.'; } return 'Nothing comes of it.'; } },
    ] },
  { id: 'grain-fleet', act: [2, 3], when: (s, P) => { const q = ownedProvinces(s, 'player').find((x) => PROV[x.id].grain > 0 && ADJ[x.id].some((e) => e.kind === 'sea')); return q && s.emperor !== 'player' && !isWinter(s.turn) ? { prov: q.id } : null; },
    title: 'The grain fleet',
    text: (s, P, c) => `The grain ships for Rome are sheltering from a storm in the harbour at ${CAPITALS[c.prov] || PROV[c.prov].name}. Your quaestor notes that grain is worth more than gold this year.`,
    options: [
      { label: 'Seize the grain and sell it · +90k', hint: 'Legitimacy −3; Rome goes hungry (its unrest +8)', apply: (s, P) => { money(s, P, 90, 'grain seized'); legit(P, -3); s.romeUnrest = clamp(s.romeUnrest + 8, 0, 100); return 'The ships sail empty. In Rome, bread doubles in price.'; } },
      { label: 'Let them sail', hint: 'Legitimacy +2', apply: (s, P) => { legit(P, 2); return 'The Senate hears of your restraint.'; } },
    ] },
  { id: 'senate-votes', act: [2, 3], when: (s, P) => ((P.friends || []).includes('senator') || P.legit < 50 ? {} : null),
    title: 'A letter from Rome',
    text: (s, P) => `${(P.friends || []).includes('senator') ? 'An old friend in the Senate' : 'A senator you barely know'} writes that votes can be had, for the right price, when the time comes to name an emperor.`,
    options: [
      { label: 'Send the money · 60k', hint: 'Legitimacy +5', need: (s, P) => (P.treasury < 60 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -60, 'senators'); legit(P, 5); return 'Your name is spoken kindly in the curia.'; } },
      { label: 'Refuse', hint: 'No effect', apply: () => 'You will need the Senate later. Perhaps.' },
    ] },
  { id: 'legate-swears', act: [2, 3, 4], cooldown: 6, when: (s, P, r) => { if ((P.circle || []).length >= MAX_GENERALS) return null; const l = r.pick(ownedLegions(s, 'player')); return l ? { legion: l.id, gid: 'G' + l.id + s.turn } : null; },
    title: 'A legate offers his sword',
    text: (s, P, c) => `${legateName(c.gid)}, who commands ${legionName(s.legions[c.legion])}, comes to your tent after dark. He has watched you, he says, and he would rather rise with you than with anyone else. He asks for an army.`,
    options: [
      { label: 'Accept his oath', hint: 'A new general (he can command an army)', apply: (s, P, c) => { addGeneral(s, P, { id: c.gid, how: '' }); return 'He swears by Jupiter and by your genius.'; } },
      { label: 'Send him back to his legion', hint: 'That legion +2 loyalty', apply: (s, P, c) => { loy(s.legions[c.legion], 2); return 'He goes back, disappointed but loyal.'; } },
    ] },
  // ---------------- the Senate
  { id: 'delator', act: [2, 3, 4], when: (s, P) => (P.friends || []).length || P.legit > 30 ? { name: legateName('del' + s.turn) } : null,
    title: 'An accuser in the Senate',
    text: (s, P, c) => `A professional accuser has charged ${c.name}, a senator who once dined at your table, with treason. Everyone is waiting to see whether you will stand by him.`,
    options: [
      { label: 'Write in his defence', hint: 'Senate favour −3; legitimacy +2; your legions approve (+1)', apply: (s, P) => { addFavour(s, 'player', -3); legit(P, 2); for (const l of ownedLegions(s, 'player')) loy(l, 1); return 'He is acquitted. The accuser will look for an easier victim.'; } },
      { label: 'Buy off the accuser · 50k', hint: 'No other effect', need: (s, P) => (P.treasury < 50 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -50, 'senators'); return 'The charge is quietly dropped.'; } },
      { label: 'Say nothing', hint: 'Senate favour +3; legitimacy −2', apply: (s, P) => { addFavour(s, 'player', 3); legit(P, -2); return 'He opens his veins. The Senate notes that you know when to keep quiet.'; } },
    ] },
  { id: 'senate-embassy', act: [3], when: (s, P) => { const A = P.leaderArmy && s.armies[P.leaderArmy]; return A && A.dest && s.prov.ROM.owner !== 'player' ? { army: A.id } : null; },
    title: 'An embassy from the Senate',
    text: () => 'Senators in their purple-bordered togas, with two Vestal Virgins, meet your army on the road. They ask you to halt and talk peace. Antonius Primus\' men once beat such an embassy; one praetor was nearly killed.',
    options: [
      { label: 'Receive them with honour', hint: 'Senate favour +8; your army halts a month', apply: (s, P, c) => { addFavour(s, 'player', 8); const A = s.armies[c.army]; if (A) A.wait = Math.max(A.wait || 0, 1); return 'You listen, promise nothing, and send them home with an escort.'; } },
      { label: 'Send them back', hint: 'Senate favour −6; legitimacy −1', apply: (s, P) => { addFavour(s, 'player', -6); legit(P, -1); return 'They go back to Rome to say that you would not hear them.'; } },
      { label: 'Let the soldiers have their baggage', hint: '+40k; Senate favour −15; legitimacy −4', apply: (s, P) => { money(s, P, 40, 'plunder'); addFavour(s, 'player', -15); legit(P, -4); return 'The Vestals are spared. Very little else is.'; } },
    ] },
  { id: 'consulship', act: [2, 3, 4], when: (s, P) => (favour(s, 'player') >= 50 && P.acclaimed ? {} : null),
    title: 'The consulship',
    text: () => 'The Senate offers you a consulship for next year. A consul gives games, and the Romans expect good ones.',
    options: [
      { label: 'Accept, and pay for the games · 100k', hint: 'Legitimacy +6; Senate favour +5', need: (s, P) => (P.treasury < 100 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -100, 'games'); legit(P, 6); addFavour(s, 'player', 5); return 'Your name will date the year.'; } },
      { label: 'Decline, as Vespasian would', hint: 'Senate favour +3', apply: (s) => { addFavour(s, 'player', 3); return 'Modesty is noted.'; } },
    ] },
  { id: 'arval', act: [3, 4], when: (s, P) => (P.acclaimed ? {} : null),
    title: 'The Arval Brothers',
    text: () => 'The Arval Brothers, the oldest college of priests in Rome, ask whether they should add your name to the vows for the safety of the emperor. It would cost a sacrifice of some size.',
    options: [
      { label: 'Pay for the sacrifice · 40k', hint: 'Legitimacy +3; Senate favour +4', need: (s, P) => (P.treasury < 40 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -40, 'sacrifice'); legit(P, 3); addFavour(s, 'player', 4); return 'Your name is cut into the bronze of the acts of the Brothers.'; } },
      { label: 'Not yet', hint: 'No effect', apply: () => 'The priests wait to see who wins.' },
    ] },
  // ---------------- trade
  { id: 'merchant-loan', act: [2, 3, 4], cooldown: 12, when: (s, P, r) => { const q = r.pick(ownedProvinces(s, 'player').filter((x) => PROV[x.id].rev >= 100)); return q ? { prov: q.id } : null; },
    title: 'The bankers of the province',
    text: (s, P, c) => `The negotiatores of ${CAPITALS[c.prov] || PROV[c.prov].name}, Italian bankers who lend to cities and kings, offer you 250k at a month's interest of one and a half in the hundred.`,
    options: [
      { label: 'Take the loan · +250k', hint: 'Borrowed +250k: interest every month', apply: (s, P) => { money(s, P, 250, 'borrowed'); P.borrowed += 250; return 'The money is counted out. So, every month, is the interest.'; } },
      { label: 'Decline', hint: 'No effect', apply: () => 'They will offer again, at a worse rate.' },
    ] },
  { id: 'pirates', act: [2, 3, 4], cooldown: 12, when: (s, P) => (ownedProvinces(s, 'player').some((x) => coastal(x.id)) ? {} : null),
    title: 'Pirates',
    text: () => 'Anicetus, a freedman of the last king of Pontus, has raised the coast with a fleet of camarae, light boats with high sides. Merchant ships are being taken.',
    options: [
      { label: 'Fit out a squadron · 80k', hint: 'Your trade is safe', need: (s, P) => (P.treasury < 80 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -80, 'squadron'); return 'Your liburnians clear the sea lanes.'; } },
      { label: 'Let the merchants look after themselves', hint: 'Your trade income halves for three months', apply: (s, P) => { P.piracyUntil = s.turn + 3; return 'Freight rates double. Fewer ships sail.'; } },
    ] },
  { id: 'mine-revolt', act: [2, 3, 4], when: (s, P, r) => { const q = r.pick(ownedProvinces(s, 'player').filter((x) => (PRODUCES[x.id] || []).includes('metal'))); return q ? { prov: q.id } : null; },
    title: 'Revolt in the mines',
    text: (s, P, c) => `The slaves in the mines of ${PROV[c.prov].name} have killed their overseers and hold the shafts.`,
    options: [
      { label: 'Send a cohort', hint: 'A legion loses 200 men; unrest there −5', apply: (s, P, c) => { const l = ownedLegions(s, 'player').sort((a, b) => (a.loc === c.prov ? -1 : 0) - (b.loc === c.prov ? -1 : 0))[0]; if (l) l.men = Math.max(1000, l.men - 200); unrest(s.prov[c.prov], -5); return 'The mines are working again by the end of the month.'; } },
      { label: 'Promise better rations · 40k', hint: 'No other effect', need: (s, P) => (P.treasury < 40 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -40, 'the mines'); return 'They go back down.'; } },
      { label: 'Let the mines close', hint: 'No metal from there for four months', apply: (s, P, c) => { s.prov[c.prov].mineClosedUntil = s.turn + 4; return 'The shafts flood. It will take months.'; } },
    ] },
  { id: 'tolls', act: [2, 3, 4], cooldown: 12, when: (s, P) => (goodsOwned(s, 'player').size >= 3 ? {} : null),
    title: 'The merchants\' petition',
    text: () => 'The shippers and merchants of your provinces petition you to halve the harbour tolls (portoria) for the season. Trade would grow; the toll farmers would not be pleased.',
    options: [
      { label: 'Halve the tolls for six months', hint: 'Trade income +30% for six months', apply: (s, P) => { P.tollsLowUntil = s.turn + 6; return 'More ships put in at your harbours.'; } },
      { label: 'Sell the toll contracts instead · +60k', hint: 'Money now', apply: (s, P) => { money(s, P, 60, 'toll contracts'); return 'The publicani pay in advance, and will take it back from the merchants.'; } },
    ] },
  // ---------------- beyond the frontiers
  { id: 'civilis', act: [2, 3], when: (s, P) => { const holders = ['GIN', 'GSU'].map((x) => s.prov[x].owner).filter((o) => o !== 'player' && o !== 'state' && s.factions[o]?.alive); return holders.length && P.rebel ? { rival: holders[0] } : null; },
    title: 'A Batavian offers his services',
    text: (s, P, c) => `Julius Civilis, prince of the Batavians, sends word: for promises alone, he will raise the Rhine against ${s.factions[c.rival].name}. Vespasian's friends made him the same offer, and regretted it.`,
    options: [
      { label: 'Accept', hint: 'The Rhine rises against him at no cost; it may not stop there', apply: (s, P, c) => { initForeign(s).incited.rhine = s.turn + 4; s.threat.rhine = clamp(s.threat.rhine + 30, 0, 120); flag(s, 'civilis', s.turn); return 'The Batavian cohorts mutiny. The Rhine burns.'; } },
      { label: 'Refuse', hint: 'No effect', apply: () => 'He shrugs. He will find another Roman.' },
      { label: 'Arrest his envoy', hint: 'Legitimacy +2; Senate favour +2', apply: (s, P) => { legit(P, 2); addFavour(s, 'player', 2); return 'The Senate approves of a Roman who will not use barbarians.'; } },
    ] },
  { id: 'civilis-turns', act: [2, 3, 4], when: (s) => (flagged(s, 'civilis') !== undefined && s.turn - flagged(s, 'civilis') >= 5 ? {} : null),
    title: 'Civilis turns on Rome',
    text: () => 'Civilis has thrown off the mask. His men burn the camps at Vetera and Novaesium, and the Gauls talk of an empire of the Gauls. Whoever holds the Rhine must deal with it.',
    options: [ { label: 'So be it', hint: 'Rhine threat +25', apply: (s) => { s.threat.rhine = clamp(s.threat.rhine + 25, 0, 120); unflag(s, 'civilis'); return 'The war on the Rhine will outlast this one.'; } } ] },
  { id: 'parthian-horse', act: [3, 4], when: (s, P) => (!s.clientsUsed?.parthia && (s.prov.SYR.owner === 'player' || initForeign(s).parthia === 'player') ? {} : null),
    title: 'Forty thousand horse',
    text: () => 'Envoys of Vologases offer you forty thousand Parthian horsemen for your war. Vespasian, offered the same, thanked the king and declined; the Senate admired it.',
    options: [
      { label: 'Decline with thanks', hint: 'Legitimacy +5; Senate favour +5', apply: (s, P) => { legit(P, 5); addFavour(s, 'player', 5); return 'Rome hears that you would not bring Parthians against Romans.'; } },
      { label: 'Take ten thousand of them', hint: '10,000 horse join you; legitimacy −15; Senate favour −15', apply: (s, P) => { const at = s.prov.SYR.owner === 'player' ? 'SYR' : ownedProvinces(s, 'player')[0].id; newLegion(s, { station: at, loc: at, group: 'east', men: 10000, exp: 0.8, owner: 'player', loyalty: 60, levy: true, payMult: 0.8, client: 'parthia' }); s.clientsUsed.parthia = 'player'; legit(P, -15); addFavour(s, 'player', -15); return 'The cataphracts ride in. Romans make the sign against the evil eye.'; } },
    ] },
  { id: 'cartimandua', act: [2, 3, 4], when: (s) => (s.prov.BRI.owner === 'player' ? {} : null),
    title: 'The queen of the Brigantes',
    text: () => 'Cartimandua, Rome\'s client queen in the north of Britain, has married her armour-bearer; her husband Venutius has raised the tribe against her. She begs for help.',
    options: [
      { label: 'Send auxiliaries to bring her out', hint: '1,000 auxiliaries lost; Britain\'s threat −20; legitimacy +2', apply: (s, P) => { s.prov.BRI.aux = Math.max(0, s.prov.BRI.aux - 1000); s.threat.britain = clamp(s.threat.britain - 20, 0, 120); legit(P, 2); return 'The auxiliaries cut their way in and bring the queen out. Venutius keeps the kingdom.'; } },
      { label: 'Leave her to it', hint: 'Britain\'s threat +15', apply: (s) => { s.threat.britain = clamp(s.threat.britain + 15, 0, 120); return 'The north is lost for now.'; } },
    ] },
  { id: 'dacians', act: [2, 3, 4], when: (s, P) => { const q = ['PAN', 'MOE'].find((x) => s.prov[x].owner === 'player' && !Object.values(s.legions).some((l) => l.loc === x && l.owner === 'player')); return q ? { prov: q } : null; },
    title: 'The Dacians cross',
    text: (s, P, c) => `With the legions gone from ${PROV[c.prov].name}, the Dacians have crossed the Danube and are storming the empty camps.`,
    options: [
      { label: 'Pay them to go home · 80k', hint: 'Danube threat −30', need: (s, P) => (P.treasury < 80 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -80, 'subsidy to dacians'); s.threat.danube = clamp(s.threat.danube - 30, 0, 120); return 'They go home with the gold, for now.'; } },
      { label: 'Let them burn', hint: 'Danube threat +20; unrest there +15', apply: (s, P, c) => { s.threat.danube = clamp(s.threat.danube + 20, 0, 120); unrest(s.prov[c.prov], 15); return 'The smoke can be seen from the river.'; } },
    ] },
  // ---------------- rivals and family
  { id: 'retirement', act: [3, 4], when: (s, P) => { const R = histRivals(s).filter((f) => strengthOf(s, f.id) > strengthOf(s, 'player') * 1.3).sort((a, b) => strengthOf(s, b.id) - strengthOf(s, a.id))[0]; return R ? { rival: R.id } : null; },
    title: 'An offer of retirement',
    text: (s, P, c) => `${s.factions[c.rival].name} writes to you, as Otho and Vitellius once wrote to each other: money, a villa in Campania, safety for your family, if you will lay down your command.`,
    options: [
      { label: 'Read his letter to the legions', hint: 'Legitimacy +4; every legion +2 loyalty; he likes you less', apply: (s, P, c) => { legit(P, 4); for (const l of ownedLegions(s, 'player')) loy(l, 2); adjustStanding(s, 'player', c.rival, -15); return 'The men jeer. They are with you.'; } },
      { label: 'Offer him the same', hint: 'He likes you better (+10)', apply: (s, P, c) => { adjustStanding(s, 'player', c.rival, 10); return 'Letters go back and forth, each politer than the last. Nobody retires.'; } },
      { label: 'Accept, and retire to Campania', hint: 'Ends your campaign', apply: (s) => { s.outcome = { win: false, cause: 'retired', turn: s.turn }; return 'You lay down your command.'; } },
    ] },
  { id: 'family', act: [2, 3, 4], when: (s, P) => { const o = s.prov.ROM.owner; return o !== 'player' && o !== 'state' && P.rebel && !flagged(s, 'familySafe') && !flagged(s, 'familyRisk') ? { rival: o } : null; },
    title: 'Your family in Rome',
    text: (s, P, c) => `Your mother and your brother are in Rome, and Rome is in the hands of ${s.factions[c.rival].name}. Vitellius left Vespasian's brother in peace for months; then the Capitol burned with him on it.`,
    options: [
      { label: 'Smuggle them out · 60k', hint: 'They are safe', need: (s, P) => (P.treasury < 60 ? 'Not enough money' : ''), apply: (s, P) => { money(s, P, -60, 'your family'); flag(s, 'familySafe'); return 'A carriage leaves by the Flaminian Gate at night.'; } },
      { label: 'Ask him for a safe-conduct', hint: 'He likes you better (+5); legitimacy −2', apply: (s, P, c) => { adjustStanding(s, 'player', c.rival, 5); legit(P, -2); flag(s, 'familySafe'); return 'He grants it, and lets it be known that you asked.'; } },
      { label: 'They must take their chance', hint: 'A risk', apply: (s, P, c) => { flag(s, 'familyRisk', { rival: c.rival, turn: s.turn }); return 'You write to them to keep indoors.'; } },
    ] },
  { id: 'family-killed', act: [2, 3, 4], when: (s) => { const f = flagged(s, 'familyRisk'); return f && s.turn - f.turn >= 3 && s.factions[f.rival]?.alive && s.prov.ROM.owner === f.rival ? { rival: f.rival } : null; },
    title: 'Your brother is dead',
    text: (s, P, c) => `${s.factions[c.rival].name}'s men dragged your brother from his house and killed him in the street. Your legions have heard.`,
    options: [ { label: 'Swear vengeance before the eagles', hint: 'Every legion +6 loyalty; legitimacy +3; no peace with him', apply: (s, P, c) => { for (const l of ownedLegions(s, 'player')) loy(l, 6); legit(P, 3); adjustStanding(s, 'player', c.rival, -60); unflag(s, 'familyRisk'); return 'The legions roar. There will be no truce with him now.'; } } ] },
  { id: 'rival-legate', act: [3, 4], cooldown: 8, when: (s, P, r) => { const l = r.pick(Object.values(s.legions).filter((x) => s.factions[x.owner]?.kind === 'hist' && x.army !== s.factions[x.owner].leaderArmy && x.id !== 'PRAET' && ownedProvinces(s, 'player').some((q) => distance(q.id, x.loc) <= 2))); return l ? { legion: l.id, rival: l.owner } : null; },
    title: 'A legate for sale',
    text: (s, P, c) => `The legate of ${legionName(s.legions[c.legion])}, serving ${s.factions[c.rival].name}, sends a freedman: for 150k and a consulship, he will bring the legion over to you.`,
    options: [
      { label: 'Pay him · 150k', hint: 'The legion comes over to you', need: (s, P) => (P.treasury < 150 ? 'Not enough money' : ''), apply: (s, P, c) => { const l = s.legions[c.legion]; if (!l || l.owner !== c.rival) return 'Too late: the legion has moved.'; money(s, P, -150, 'bought ' + l.id); takeLegion(s, l, 'player', 45); l.bought = true; adjustStanding(s, 'player', c.rival, -20); return `${legionName(l)} hails you.`; } },
      { label: 'Send the freedman back to his master', hint: 'He likes you better (+15)', apply: (s, P, c) => { adjustStanding(s, 'player', c.rival, 15); return `${s.factions[c.rival].name} thanks you, and has his legate killed.`; } },
      { label: 'Ignore it', hint: 'No effect', apply: () => 'The freedman goes away.' },
    ] },
  // ---------------- what earlier answers lead to
  { id: 'prophecy', act: [3, 4], when: (s) => (flagged(s, 'astrologer') ? {} : null),
    title: 'The prophecy',
    text: () => 'Your astrologer\'s prophecy has spread from the camp to the cities. Men say the purple is written in the stars for you. Some senators find this vulgar.',
    options: [
      { label: 'Let it spread', hint: 'Legitimacy +4; Senate favour −3', apply: (s, P) => { legit(P, 4); addFavour(s, 'player', -3); unflag(s, 'astrologer'); return 'Coins appear with a star on them.'; } },
      { label: 'Banish the astrologers, as emperors do', hint: 'Senate favour +4', apply: (s) => { addFavour(s, 'player', 4); unflag(s, 'astrologer'); return 'The Chaldeans leave Italy. They will be back.'; } },
    ] },
  { id: 'father-in-law', act: [3, 4], when: (s) => (flagged(s, 'married') ? { name: flagged(s, 'married') } : null),
    title: 'Your father-in-law',
    text: (s, P, c) => `${c.name}, your father-in-law, would like a consulship for his son. He reminds you, gently, of the dowry.`,
    options: [
      { label: 'Promise it', hint: 'Senate favour +6; legitimacy −1', apply: (s, P) => { addFavour(s, 'player', 6); legit(P, -1); unflag(s, 'married'); return 'He is delighted. His friends in the curia are delighted.'; } },
      { label: 'Refuse', hint: 'Senate favour −6', apply: (s) => { addFavour(s, 'player', -6); unflag(s, 'married'); return 'Dinner is cold at your wife\'s house.'; } },
    ] },
  { id: 'priests', act: [2, 3, 4], when: (s) => { const p = flagged(s, 'temple'); return p && s.prov[p].owner === 'player' ? { prov: p } : null; },
    title: 'The priests\' curse',
    text: (s, P, c) => `The priests whose treasure you borrowed have cursed your name in the temple at ${CAPITALS[c.prov] || PROV[c.prov].name}. The people of the province believe in curses.`,
    options: [
      { label: 'Repay it with interest · 180k', hint: 'Legitimacy +4; unrest there −10', need: (s, P) => (P.treasury < 180 ? 'Not enough money' : ''), apply: (s, P, c) => { money(s, P, -180, 'temple repaid'); legit(P, 4); unrest(s.prov[c.prov], -10); unflag(s, 'temple'); return 'The curse is lifted with ceremony.'; } },
      { label: 'Let them curse', hint: 'Unrest there +10', apply: (s, P, c) => { unrest(s.prov[c.prov], 10); unflag(s, 'temple'); return 'Some of the farmers stop paying.'; } },
    ] },
  { id: 'tribune-revolt', act: [3, 4], when: (s) => { const f = flagged(s, 'tribune'); return f && s.legions[f.legion]?.owner === 'player' && s.factions[f.rival]?.alive ? f : null; },
    title: 'The tribune\'s cohorts',
    text: (s, P, c) => `The tribune you did not arrest has gone over to ${s.factions[c.rival].name}, and taken two cohorts of ${legionName(s.legions[c.legion])} with him.`,
    options: [ { label: 'Close the ranks', hint: 'That legion loses 1,000 men; every other legion +2 loyalty', apply: (s, P, c) => { const l = s.legions[c.legion]; l.men = Math.max(1000, l.men - 1000); for (const x of ownedLegions(s, 'player')) if (x.id !== c.legion) loy(x, 2); unflag(s, 'tribune'); return 'The rest of the legion swears again.'; } } ] },

];

// ---------------------------------------------------------------- the month

export function storyTurn(s) {
  if (!s.opts.human) return;
  const P = s.factions.player;
  if (!P.alive || s.outcome) return;
  s.story = s.story || [];
  const a = actOf(s);
  if (s.lastAct && a > s.lastAct) for (let k = s.lastAct + 1; k <= a; k++) if (ACT_PAGES[k]) s.story.push(ACT_PAGES[k](s));
  s.lastAct = a;
  if (s.turn === 4 && !s.neroPage) { s.neroPage = true; s.story.push(NERO_PAGE); }
  if (s.emperor && s.emperor !== s.lastEmperor) {
    if (s.emperor === 'player') s.story.push({ title: 'Imperator Caesar Augustus', kind: 'act', text: ['The Senate has voted you the powers of the emperor: tribunician power, proconsular command, the name of Caesar. Now you must keep them.', `Hold Rome ${s.diff.hold} months. Feed the city, pay the Praetorians, and watch the Senate: men who voted for you this morning can vote for someone else tomorrow.`] });
    else if (s.factions[s.emperor]) s.story.push({ title: `${s.factions[s.emperor].name}, emperor`, kind: 'world', text: [EMPEROR_LINE[s.emperor] || `${s.factions[s.emperor].name} has taken Rome, and a frightened Senate has voted him the powers of the emperor.`, 'Every legate in the empire is now deciding whether to swear to him.'] });
  }
  s.lastEmperor = s.emperor;
  s.deathsSeen = s.deathsSeen || {};
  for (const f of Object.values(s.factions)) if (f.kind === 'hist' && !f.alive && !s.deathsSeen[f.id] && EPITAPH[f.id]) { s.deathsSeen[f.id] = true; s.story.push({ title: `The end of ${f.name}`, kind: 'world', text: [EPITAPH[f.id], f.submittedTo === 'player' ? 'He knelt to you, and his legions are yours.' : 'His legions are looking for a new master.'] }); }
  if (s.event) return;
  const r = streamFor(s.seed, s.turn, 'story');
  if (!r.chance(0.4)) return;
  s.eventsSeen = s.eventsSeen || {};
  const open = EVENTS.filter((e) => e.act.includes(a) && (s.eventsSeen[e.id] == null || (e.cooldown && s.turn - s.eventsSeen[e.id] >= e.cooldown)));
  for (const e of r.shuffle([...open])) {
    const c = e.when(s, P, r);
    if (!c) continue;
    s.eventsSeen[e.id] = s.turn;
    s.event = { id: e.id, turn: s.turn, c, title: e.title, text: e.text(s, P, c), options: e.options.map((o) => ({ label: o.dyn ? o.dyn(s, P, c) : o.label, hint: o.hint })) };
    return;
  }
}

export function eventView(s) {
  if (!s.event) return null;
  const e = EVENTS.find((x) => x.id === s.event.id);
  const P = s.factions.player;
  const c = s.event.c || {};
  const where = c.prov || (c.legion && s.legions[c.legion]?.loc) || (c.army && s.armies[c.army]?.loc) || null;
  return { ...s.event, where, options: s.event.options.map((o, i) => ({ ...o, index: i, why: e.options[i].need ? e.options[i].need(s, P, s.event.c) : '' })) };
}

export function chooseEvent(s, i) {
  const ev = s.event;
  if (!ev) return { error: 'Nothing to answer' };
  const e = EVENTS.find((x) => x.id === ev.id);
  const o = e && e.options[i];
  if (!o) return { error: 'No such answer' };
  const P = s.factions.player;
  const why = o.need ? o.need(s, P, ev.c) : '';
  if (why) return { error: why };
  // a legion or province named in the event may be gone by now
  if ((ev.c.legion && !s.legions[ev.c.legion]) || (ev.c.army && !s.armies[ev.c.army])) { s.event = null; return { ok: true, text: 'The moment has passed.' }; }
  const text = o.apply(s, P, ev.c, streamFor(s.seed, s.turn, 'story-choice'));
  s.event = null;
  s.storyLog = [...(s.storyLog || []), { t: s.turn, title: ev.title, choice: o.dyn ? o.dyn(s, P, ev.c) : o.label, text }].slice(-30);
  return { ok: true, text };
}

