// The story: pages that tell you where you are (the opening, each new act,
// Nero's death), and things that happen to you that need an answer. Every
// answer moves a number the rest of the engine reads; nothing here is only
// words. Human games only: the bot and the measurements never see it.
import { PROV, ADJ, isWinter } from './graph.js';
import { streamFor } from './rng.js';
import { actOf, legionName, money, ownedLegions, ownedProvinces, legateName } from './core.js';
import { CAPITALS } from '../data/seeds.js';
import { addGeneral, MAX_GENERALS } from './generals.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
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
  { id: 'pay-day', act: [1, 2, 3, 4], cooldown: 10, when: (s, P, r) => { const l = r.pick(ownedLegions(s, 'player')); return l ? { legion: l.id } : null; },
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
      { label: 'Keep him close; let the men hear', hint: 'Legitimacy +2, every legion +2 loyalty; in Act I, suspicion +10', apply: (s, P) => { legit(P, 2); for (const l of ownedLegions(s, 'player')) loy(l, 2); if (!P.ownsProvince) P.suspicion += 10; return 'By evening the whole camp knows your destiny.'; } },
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
      { label: 'Borrow it, with a receipt · +150k', hint: `Unrest there +12, legitimacy −3`, apply: (s, P, c) => { money(s, P, 150, 'temple treasure'); unrest(s.prov[c.prov], 12); legit(P, -3); return 'The gold is weighed out. The priests will not forget.'; } },
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
      { label: 'Accept', hint: 'Dowry +100k, legitimacy +4', apply: (s, P) => { money(s, P, 100, 'dowry'); legit(P, 4); return 'The wedding is quick, and well attended.'; } },
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
      { label: 'Ignore it', hint: 'A risk: that legion may lose 10 loyalty', apply: (s, P, c, r) => { if (r.chance(0.5)) { loy(s.legions[c.legion], -10); return 'The tribune was what the freedman said. Half his legion now thinks as he does.'; } return 'Nothing comes of it.'; } },
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
  { id: 'legate-swears', act: [2, 3, 4], cooldown: 6, when: (s, P, r) => { if ((P.generals || []).length >= MAX_GENERALS) return null; const l = r.pick(ownedLegions(s, 'player')); return l ? { legion: l.id, gid: 'G' + l.id + s.turn } : null; },
    title: 'A legate offers his sword',
    text: (s, P, c) => `${legateName(c.gid)}, who commands ${legionName(s.legions[c.legion])}, comes to your tent after dark. He has watched you, he says, and he would rather rise with you than with anyone else. He asks for an army.`,
    options: [
      { label: 'Accept his oath', hint: 'A new general (he can command an army)', apply: (s, P, c) => { addGeneral(s, P, { id: c.gid, how: '' }); return 'He swears by Jupiter and by your genius.'; } },
      { label: 'Send him back to his legion', hint: 'That legion +2 loyalty', apply: (s, P, c) => { loy(s.legions[c.legion], 2); return 'He goes back, disappointed but loyal.'; } },
    ] },
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
  return { ...s.event, options: s.event.options.map((o, i) => ({ ...o, index: i, why: e.options[i].need ? e.options[i].need(s, P, s.event.c) : '' })) };
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

