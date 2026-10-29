# Imperator — design spec

Rome, AD 68–71. You are a legionary legate nobody in history remembers. Nero is
failing, the frontier armies are restless, and four men will try to take the
throne. You intend to be the fifth, and the last.

Status: **Stage 2 kill gate run 2026-10-24** (`sim/`, results in
`docs/KILLGATE.md`). Rules marked *(kill gate)* below were added or changed by
what the sim found. Next gate: Stage 3 design proposal.

---

## 1. Setting

The civil wars of AD 68–69 and their aftermath. Nero's regime collapses in the
spring of 68 (Vindex's revolt in Gaul, Galba's proclamation in Spain, Nero's
suicide in June). Through 69, four men are proclaimed by their armies: Galba,
Otho, Vitellius, Vespasian. Three of them are dead within the year.

Why it is a game: the decisive resources were not battles. They were the
loyalty of individual legions (bought with donatives and lost by refusing to
pay them), money, the grain supply to Rome, recognition by the Senate and the
Praetorians, and the security of the frontiers each army abandoned to march.
Those are tradeable, scarce and in tension. That is a strategy game.

**The divergence.** You exist, so history bends. The four historical claimants
still rise on roughly their historical schedule, but events that killed them
early (Galba's murder in January 69, Otho's suicide after First Bedriacum)
become contests instead of certainties. All four reach the final act. You are
the unhistorical fifth.

## 2. Pillars

1. **Every armed body in your path is a decision.** Buy it, talk it over, fight
   it, or go around it. Each costs something different.
2. **Loyalty is bought, not owned.** Every legion has its own loyalty, history
   and grievances. Promises are debts and they come due.
3. **The empire is the map.** The full map at its historical province count,
   with real legion stations, real frontiers and real sailing seasons.
4. **History moves without you.** Rivals act on the same rules as the player.
   Frontiers flare when stripped. News arrives late.
5. **Taking Rome is half the job.** The win is holding it.
6. **Four roads to the throne.** Wealth, military power, politics and
   personal charisma each carry a run to the win. Who you were before the
   game decides which road is open to you.

## 3. Core loop (one turn = one month)

1. **Dispatches.** Reports arrive. Information about distant provinces is
   weeks old (news lag by distance; see §9).
2. **Provinces.** One or two decisions per province you hold (tax level, levy,
   grain, appointee). Defaults carry forward, so quiet provinces take no clicks.
3. **Armies.** Move, encamp, besiege, send envoys. Mark a route; the army
   follows it.
4. **Politics.** Letters, promises, appointments, bribes, accusations. Senate,
   Praetorians, rival governors, client kings.
5. **Resolution.** Movement, then encounters (§6), pay and donatives due,
   loyalty changes, frontier pressure, events.
6. **Check** the ways to lose (§11) and the win (§12).

Campaign length: start March 68; the final act opens no earlier than July 69;
a full campaign to a win runs about 40 monthly turns.

## 4. The four acts

| Act | Name | Starts | Your goal | Rivals active |
|---|---|---|---|---|
| I | Legatus | March 68 | Control your province: win the other legions, remove or turn the governor | Fellow legates, the governor, procurators, procedural rivals |
| II | Acclamation | You control your province | Build strength, take neighbours, pick the moment to be proclaimed | Historical minor claimants (§8), procedural claimants; Galba proclaimed (April 68) |
| III | The March | You are proclaimed, or January 69 | Take provinces, secure grain and money, close on Italy | Galba, Otho, Vitellius active and anchored; Vespasian joins July 69; minor claimants still appear |
| IV | Year of Five Emperors | July 69, Vespasian's proclamation *(kill gate: fixed to the calendar)* | Take Rome, be recognised by the Senate, hold it (12 / 18 / 24 months by difficulty); the hold clock runs only in Act IV | The four historical claimants, anchoring off |

**Acts I–III play differently.**
- **Act I** is close-in politics and small fights inside one province: three or
  four legions, their legates, auxiliary units, a governor with his own plans.
  Ways in: bribery, letters to Rome accusing the governor, waiting for him to
  overreach, a mutiny you start or stop, appointment by a new emperor who needs
  you.
- **Act II** is timing. Being proclaimed too early makes you everyone's target;
  too late and someone else takes your neighbours' legions first.
- **Act III** is the campaign: long marches, many small fights, few large ones.

## 5. Legions, loyalty and money

### Legions
Each legion is an individual with:
- **Strength** (men; nominal about 5,000, often less), **experience**, **station**
  (home province).
- **Loyalty** to you, 0–100.
- **History tags**, such as service with other legions, past mutinies, famous
  victories (XIV Gemina and Boudicca), pride in a former commander.
- **Grievances**, such as unpaid promises, being moved from their station,
  favouritism shown to another legion, being made to fight old comrades.
- **Legate**, a person with his own character and ambition. Legates can become
  rivals.

Auxiliary cohorts and cavalry units (alae), the Praetorian Guard, urban cohorts
and the fleets at Misenum and Ravenna are separate bodies on the same model.

### Loyalty moves on
- **Up:** pay on time, donatives, victories, a commander they respect, plunder,
  being allowed to return to station.
- **Down:** distance from station, unpaid promises, defeats, rival bribes,
  fighting legions they served with, being made to garrison while others
  plunder.
- **At zero** a legion hails someone else: its legate, a rival, or the next
  ambitious officer. It does not simply leave.

### Money
- Unit: **denarii.** Legionary pay is 225 denarii a year (Augustus to Domitian),
  so a full-strength legion costs about 94,000 a month before auxiliaries and
  officers.
- **Donatives** are the lever and the trap. The Praetorians were promised 7,500
  denarii a man in Galba's name (Plutarch, *Galba* 2); Galba refused to pay and
  died.
- **Promises outstanding** are tracked as debt. Every garrison you buy with a
  promise adds to it. Victory makes it come due.
- One economy reference (`docs/ECONOMY.md`, Stage 3) sets incomes, pay and
  prices for the engine and the prose together.

## 6. Encounters: small fights and the four options

Any garrison, legion, auxiliary unit or fortified town your army meets is an
encounter. Target: **30–50 small fights and 3–5 large battles per campaign.**

| Option | Spends | Risk |
|---|---|---|
| **Buy** | Denarii now, or a promise | Debt; they can be bought again by a rival |
| **Negotiate** | Legitimacy, oaths, hostages, shared history | Fails at low legitimacy or bad reputation; can end in a stand-aside rather than a defection |
| **Fight** | Men, time, loyalty if they are old comrades | Casualties take months to replace |
| **Bypass** | Time | An enemy behind you: cut supply, raided rear, a rival's new recruit |

**Negotiate options** (each shown with what it spends, not what it will do):
oath to the Senate and People, appeal to comrades (needs a shared history tag),
deferred promise (adds debt), show of strength (needs a clear numbers edge),
families and hostages.

**Small fights** resolve in under a minute: 2–3 choices (approach, how much to
commit, whether to pursue). Each choice beats one and loses to one. Chance
moves numbers (about ±15%); it never decides what beats what. Fight types for
variety: river crossing, walled town, ambush in a pass, night assault, a unit
breaking or changing sides mid-fight. Terrain and season modify each.

**Large battles** (Bedriacum-scale) open a short tactical layer of 3–5 rounds.
State carries between rounds (reserves, fatigue, ground). The enemy adapts to
repetition.

**Auto-resolve** uses the same resolver under a policy. No second code path.

**Bodies money cannot settle** *(kill gate)*. Without these, the wealth and
politics roads bought and talked their way through whole campaigns with almost
no fighting.

| Body | Where | Options | Notes |
|---|---|---|---|
| Walled town | One or two per settled province | Negotiate (open the gates), fight (storm), bypass | Cannot be bought. Storming sacks the town: plunder and loyalty for the men, a little legitimacy lost, unrest, and the army loses its next month |
| Raiders | Frontier provinces when threat is high | Fight only | Hit whoever holds the province; unopposed they cost unrest, revenue and more threat |
| Brigands | Provinces with unrest over 50 | Fight only | The price of heavy taxes and sacked towns |

**Bought men stay bought only while paid** *(kill gate)*. Bought legions lose
loyalty faster than others, and any faction with money can outbid for a
wavering enemy legion just before a battle. Same rule for everyone.

## 7. Provinces

The full empire at its historical province count for 68–69 (about 37; see
`docs/PROVINCES.md`). Italy is not a province; it is split into four game
regions (the north including Cremona and Bedriacum, Etruria and Umbria, Rome
and Latium, Campania and the south including Misenum).

**Depth by tier**, so the management layer stays live without becoming a chore:

| Tier | Count (approx.) | Decisions |
|---|---|---|
| Legion provinces | 11 | Full: legions, levy, frontier, governor |
| Grain and wealth | 6 | Tax level, grain diversion, appointee |
| Interior | ~16 | Tax level, garrison; usually one click or none |
| Procurator districts | ~6 | Routes and passes; appointee |
| Italy regions | 4 | Senate, Praetorians, the crowd, grain distribution |

Each province has: revenue, grain, unrest, a garrison, a governor or procurator
(a person with loyalty), and frontier threat if it borders one.

**Province decisions** (at most two per turn per province):
- **Tax level:** normal, heavy, extortion. Heavier taxes bring money now and
  unrest later.
- **Levy:** auxiliaries (fast), or a new legion (slow: months; Galba raised
  VII Galbiana in Spain, Clodius Macer raised I Macriana in Africa).
- **Grain:** ship to Rome, hold, or embargo. Africa and Egypt are the weapon.
- **Appointee:** a client who is loyal, or a capable man who might not be.

## 8. Rivals

Rivals play by the player's rules: same pay, same loyalty model, same
encounters, same news lag.

### The four historical claimants (anchored until Act IV)

| Claimant | Base | Character |
|---|---|---|
| Galba | Hispania Tarraconensis | Old nobility, high legitimacy, stingy: will not pay donatives |
| Otho | Lusitania, then Rome | Courts the Praetorians; charming, quick, short of legions |
| Vitellius | Germania Inferior | The Rhine legions behind him; slow, indulgent, generous |
| Vespasian | Judaea and the East | Patient; controls Egypt and the grain; lets others fight |

**Anchoring rule (Acts I–III):** a historical claimant can be weakened (lose
provinces, legions, allies, money) but not killed. Defeated, he retreats to his
base and rebuilds. Their proclamations are tied to historical triggers, not
fixed dates, so a strong player can make them earlier or later. The rule holds
mostly through geography and timing: the four are out of reach for most of
Acts I–II anyway. From Act IV, all four are mortal.

### Historical minor claimants and kingmakers (Acts I–III)

| Figure | Where | Historical role | Game role |
|---|---|---|---|
| C. Julius Vindex | Gallia Lugdunensis | Revolts March 68; crushed at Vesontio | Early rival or ally; his Gauls are cheap and brittle |
| L. Verginius Rufus | Germania Superior | Beat Vindex; refused the throne twice | Kingmaker; his legions will offer the purple to someone |
| L. Clodius Macer | Africa (legate, III Augusta) | Cut Rome's grain; raised a legion; killed late 68 | A legion legate who did what you are doing; grain rival |
| Nymphidius Sabinus | Rome (Praetorian prefect) | Tried to seize power, killed 68 | Rome-based rival; the Praetorians' price |
| Fonteius Capito | Germania Inferior | Governor, killed late 68 | Rhine rival before Vitellius arrives |
| C. Licinius Mucianus | Syria | Backed Vespasian, ran his war | Ally, rival or kingmaker in the East |
| Lucceius Albinus | The Mauretanias | Accused of royal ambitions 69 | Western rival; threatens Spain and Africa |
| M. Antonius Primus | Pannonia | Led the Danube legions into Italy | Free-agent general; can join anyone |
| Julius Civilis | Batavian lands, Rhine | Revolt 69–70 | Not a claimant; a frontier disaster for whoever strips the Rhine |

Mark uncertain details as "traditional" in game text. Sources in
`docs/PROVINCES.md`.

### Procedural rivals
Generated legates, governors and prefects with an ambition trait. They appear
when conditions favour them: an emperor far away, unpaid legions, a frontier
victory, a dead governor. Every run has a different cast. Target: two or three
active procedural rivals per act.

### How only the four reach the last act *(kill gate)*
- The four always rise. If a claimant's own province is taken, he rises in the
  nearest neutral province instead (Otho rises in Campania with the fleet
  legion, I Adiutrix, if Galba's army holds Rome).
- When Act IV opens, every surviving minor or procedural rival folds into the
  strongest claimant within three months' march, as Mucianus and the Danube
  legions did for Vespasian. The player counts as a claimant and can receive
  them.
- In Act IV the surviving claimants keep drawing men: a new legion every few
  months (by difficulty).
- A general who deserts you in Act IV goes over to a living claimant; he does
  not become a sixth.

## 9. Time, distance and news

- **Monthly turns.** Movement is in route segments with monthly travel times.
- **Sailing season.** Seas are effectively closed November to March (*mare
  clausum*). Winter crossings are possible, slow and dangerous.
- **Alpine passes** are hard or closed in winter (Caecina crossed the Great
  St Bernard in snow in early 69; Tacitus, *Histories* 1.70). Crossing costs
  men and time.
- **News lag.** What you see of a distant province or rival is as of when the
  news left. Rome to Syria is weeks old; Britain in winter, older. Rumour is
  marked as rumour.

## 10. Frontiers

Every legion pulled from a frontier raises that frontier's threat. Each has a
historical flashpoint:

| Frontier | Threat in 68–70 |
|---|---|
| Rhine | Batavian revolt under Civilis; German tribes |
| Danube | Roxolani raid Moesia (winter 68–69); Dacians (69) |
| Britain | Brigantes under Venutius (69) |
| East | Parthia; the Jewish War, still running |
| Africa | Garamantes raid (69–70) |

A frontier that breaks costs provinces, revenue and legitimacy, and pulls
legions back whether you like it or not.

## 11. Ways to lose

1. **Death.** Assassinated, executed or killed with your army. A decisive
   defeat with no line of retreat ends the run (Otho's choice).
2. **Mutiny.** Your legions hail someone else. Loyalty collapse across your
   army, not a single legion.
3. **History passes you by.** You have not been proclaimed within two months
   of Act IV opening, or you hold no province. The new emperor recalls you, and
   recall means death (Capito, Macer). *(kill gate: the spec had Act IV wait
   for your proclamation, which made this loss impossible.)*
4. **Losing the throne.** You lose Rome during the hold and cannot retake it
   within three months.

## 12. One win, four roads

The win is the same on every run: take Rome, be recognised by the Senate (a
law conferring the imperial powers, like the surviving *lex de imperio
Vespasiani*), and **hold it** for the months your difficulty sets (§14). The
other claimants do not need to be dead, but while they live they will come for
you.

How you get there, and how you hold it, depends on your road. Each road leans
on one stat (§13) and one encounter option (§6), and each has its own way to
hold Rome.

| Road | Stat | Favoured option | How it takes legions | How it holds Rome | Its weakness |
|---|---|---|---|---|---|
| **Wealth** | Opes | Buy | Pays garrisons and legions over | Pays the Praetorians, funds the grain dole, buys senators | Debt; anyone can outbid you; the treasury runs dry in the hold |
| **Military** | Virtus | Fight | Beats them, then takes the survivors | Terror; a garrisoned Italy; victorious legions kept close | Casualties; frontiers stripped; your own generals grow ambitious |
| **Politics** | Auctoritas | Negotiate (oaths, law, office) | Legal authority; governors turned by letters and appointments | The Senate's law; consulships for allies; legitimacy | Slow; weak against a rival with more legions |
| **Charisma** | Gratia | Negotiate (appeals, comrades) | Defections; legions that follow the man, not the money | The crowd and the army love you; mutiny is rare | Depends on your presence; loyalty fades where you are not |

Rules that keep the roads honest:
- **No road is closed.** A rich legate can still fight, and a soldier can still
  bribe. Each road just makes one option cheaper or stronger.
- **Mixed roads are allowed.** Most good runs will lean on two. The ending
  names the road you took, based on how you actually won.
- **Every road must win at Legate.** The kill gate (§16) measures win rate by
  road; no road may dominate.

Holding Rome on any road means paying the debts your promises ran up, keeping
the grain coming, keeping the Praetorians bought, keeping the Senate frightened
or flattered, and stopping your generals becoming the next you.

## 13. The legate: background and stats

Before the game starts you build your legate through his life so far: about
seven short choices, following the real Roman senatorial career (the *cursus
honorum*). Each choice sets stats, gives you a **friend** (a named person who
appears in the game), and sometimes an **enemy** or a liability. A quick-start
option picks a ready-made legate for each road.

### Stats

| Stat | Latin | What it does |
|---|---|---|
| Wealth | Opes | Starting fortune, estates, credit; cheaper buying |
| Military | Virtus | Fight resolution, legion respect, recovery from defeat |
| Politics | Auctoritas | Legitimacy, Senate standing, letters and appointments |
| Charisma | Gratia | Negotiation, appeals to comrades, loyalty of the troops near you |

Stats start between about 1 and 5 and move during play. Friends and enemies
are named people with their own careers in the game: a fellow tribune who now
commands a legion, a moneylender in Rome, a freedman in the palace, a senator
who owes you a favour.

### The choices

| # | Stage (approx. age) | Options | Gives |
|---|---|---|---|
| 1 | **Family** | Old patrician house; plebeian nobility; new man from Italy; new man from the provinces (Spain, Narbonensis) | Starting Auctoritas and Opes; old families start with legitimacy, new men with fewer enemies |
| 2 | **Upbringing** | Rhetoric schools in Rome; Greek education in Athens or Rhodes; raised on the family estates; raised in a frontier province | Gratia, Auctoritas or Opes; a provincial upbringing gives friends in that province |
| 3 | **First office (about 18)** | Mint (*tresviri monetales*); courts (*decemviri stlitibus iudicandis*); police (*tresviri capitales*); roads (*quattuorviri viarum curandarum*) | Opes, Auctoritas, a Rome contact |
| 4 | **Military tribune (about 20–23)** | With a Rhine legion; on the Danube; in the East under Corbulo; in Britain during Boudicca's revolt (60–61) | Virtus, and a shared-service tag with that legion, which opens the appeal-to-comrades option against it later |
| 5 | **Quaestor (about 25)** | In Rome; in a province under a governor (who becomes your patron); attached to Nero's court | Opes, Auctoritas or a palace contact; Nero's court gives contacts and an enemy |
| 6 | **Aedile or tribune of the plebs (about 27–30)** | Aedile who paid for lavish games; aedile who kept the books; tribune of the plebs | Gratia at the cost of Opes; Opes; Auctoritas |
| 7 | **AD 65, the Pisonian conspiracy** | Kept silent; informed on others; friends were executed; you were in the plot and not named | Each choice trades safety, enemies and contacts. Informing makes you trusted by Nero's men and hated by survivors |

Then the praetorship, and your posting as legate of a legion in your start
province (§15). The background does not lock a road; it makes one or two of
them cheaper.

**Historical check.** Ages and office order follow the standard senatorial
career of the period. Gaps are normal and some steps could be skipped; mark
these as typical, not mandatory.

## 13a. Holding Rome *(kill gate)*

The first sim had no hold to speak of: 86% of Legate runs that took Rome went
on to win. Three of the four historical emperors failed at exactly this stage,
so it is now its own game.

**Recognition.** The Senate recognises a proclaimed claimant who holds Rome
with no hostile legions in Rome, Etruria or Campania, if his legitimacy is 25
or more, **or** if he has five or more legions in Italy (terror: the Senate
gives a smaller legitimacy gain).

**Pressures every month in Act IV:**
- **Donatives** fall due: the Praetorians' price and a smaller sum per legion.
- **Grain:** shortfalls raise Rome's unrest, which costs legitimacy and the
  Praetorians' loyalty.
- **Conspiracy:** a monthly chance of a plot. It rises with low legitimacy and
  Rome's unrest, falls with legions in Italy and with your road's own stat. If
  a plot comes, your road's stat sets the odds it succeeds: the guard
  (military), the Senate's warnings (politics), the crowd (charisma), paid
  informers (wealth).
- **Generals:** a disloyal legion away from you may go over to a living rival.

**Spending, by road:** everyone can pay for the grain dole; wealth buys
senators, politics hands out consulships, charisma pays for games and
largesse. All three raise legitimacy and give money somewhere to go late in
the game.

## 14. Difficulty

Three levels, named for the ranks you would rather be in the war.

| | **Legionary** (easy) | **Centurion** (normal) | **Legate** (hard) |
|---|---|---|---|
| Target win rate, competent play | about 35% | about 15% | **5%** |
| Procedural rivals per act | 1 | 2 | 3–4 |
| Historical minor claimants | Some stand aside | All active | All active; more of them can win |
| Rival behaviour | Slow; rarely outbid you | Act on the player's rules | Act on the player's rules, ally against the leader |
| Hold Rome for | 12 months | 18 months | 24 months |
| Loyalty drop with distance | Halved | Normal | Normal; promises fall due sooner |
| Frontier threat | Low | Normal | High |
| News lag | Rivals shown as of now | Normal | Normal; more false rumour |
| Starting funds | +50% | Normal | Normal |
| Encounter odds | Wider margin to win a fight | Normal | Normal |
| Historical claimants *(kill gate)* | +3 to stats, legions somewhat loyal, richer | +3, legions loyal, richer | +3, legions loyal, much richer |
| Claimants' new legions in Act IV *(kill gate)* | Every 4 months | Every 3 months | Every 3 months |
| Conspiracy and generals *(kill gate)* | Moderate | High | Highest |
| Praetorians' donative *(kill gate)* | Lower | Normal | Higher, due at once |

Measured in the kill gate (350 runs per road per level): Legionary 33.7%,
Centurion 13.7%, Legate 5.2%. See `docs/KILLGATE.md`. The exact knob values
live in `sim/model.js` (`DIFFICULTY`). "Competent play" means the reference bot policies (§16); human
win rates will differ and get calibrated at playtest.

## 15. Starting provinces

You pick a province none of the four historical claimants holds. The start sets
difficulty and play style.

| Start | Legions | Character |
|---|---|---|
| Britannia | 3 | Isolated and safe; the Channel blocks you both ways |
| Germania Superior | 3 | Strong; next door to Vitellius and Verginius Rufus |
| Pannonia | 1–2 | The centre; the Danube legions are the swing vote |
| Moesia | 2–3 | Danube; Roxolani at your back |
| Dalmatia | 1–2 | Closest to Italy; exposed |
| Africa | 1 | Grain weapon; you are Clodius Macer's rival or his heir |
| Syria | 3–4 | Rich; Vespasian and Mucianus next door |

Legion counts shift during 68–69 as units move; see `docs/PROVINCES.md`.

## 16. Next stage: the kill gate

A numbers-only sim (no UI, no art): fixed policies × seeds × the full campaign.
It must show:

- **Buy, negotiate, fight and bypass are each best somewhere.** Buy-everything
  goes bankrupt; fight-everything runs out of men; bypass-everything gets cut
  off.
- **Fight count lands in range:** 30–50 small fights, 3–5 large battles.
- **Win rates by difficulty:** Legate about 5%, Centurion about 15%,
  Legionary about 35%, each with its run count and noise floor.
- **Every road wins.** A reference bot per road (wealth, military, politics,
  charisma), all with a sensible background for that road. At Legate each
  road wins between about 3% and 8%; none dominates.
- **Background matters but does not decide.** A wealth background on the
  military road should be worse, not hopeless.
- **No dominant start.** Every start province wins sometimes.
- **The anchor holds** without visible plot armour: count how often a
  historical claimant reaches zero strength before Act IV.
- **The hold matters:** some runs take Rome and still lose it.

If the decisions aren't interesting as a table of numbers, no amount of UI
fixes it.

## 17. Assumptions and open questions

| Item | Assumed | Needs the author |
|---|---|---|
| Turn length | One month | — |
| Start date | March 68 (Vindex's revolt) | — |
| Player | A fictional legionary legate built through seven background choices (§13) | — |
| Win rate targets | Legate 5%, Centurion 15%, Legionary 35%; measured 5.2%, 13.7%, 33.7% | — |
| Difficulty name | "Legionary" rather than "Legionnaire" (the Roman term) | Confirm |
| Stack | Vanilla ES modules, no build step, phone-first PWA (the simulation-game shape used in Civ-City, The Lists, Football) | Confirm at Stage 3 |
| Art | Not decided | Visual identity at Stage 5 |

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-26 | **Guide, field, two Augusti, sound** (`docs/DESIGN.md` §18). The author: "i agree to all". A guide through the first months; words and effects on the field and a clear result; a lesser victory by dividing the empire with the last rival (rare: 0.4–2.3% of campaigns); synthesised sound with a switch. Legionary hold 14 → 15. Balance: Legionary 33.6%, Centurion 15.6%, Legate 5.3%. Also fixed: the page background stopped after one screen when the host painted its own. |
| 2026-10-27 | **One circle; governors and generals on orders; men who turn** (`docs/DESIGN.md` §19). The author: "generals and governors should pull from the same pool of characters ... given a salary", then "I agree, continue on" to rebellion with warnings and to generals asking before large battles. Salaries; governors on standing instructions by trait; generals on hold/guard/expand/hunt/support; loyalty, ambition, restless warnings, gift/marriage/hostage. Save version 3. Legate hold 24 → 27. Balance: Legionary ~35%, Centurion ~15%, Legate ~5%. |
| 2026-10-27 | **The Guard** (`docs/DESIGN.md` §20). The author: "yes, add the Praetorian replacement. That is super scandalous, and really fun!" Dismiss the Praetorians and make a legion your Guard (once, as emperor); promise the Guard to your legions on the march (kept within four months or broken). Balance unchanged. Measured: the military road's gap is in reaching Rome, not holding it; the Guard does not close it. |
| 2026-10-29 | **A soldier's army** (`docs/DESIGN.md` §21). The author: "build the military retreat fix". Measured cause was time and money, not battle; built orderly retreat, foraging, forced marches, recognition at three legions in Italy. Military on Centurion 9.5% → 12.3%. Hold: Legionary 13, Legate 23. Balance at 2,240 runs a level: 36.8 / 16.0 / 5.0%. |
| 2026-10-26 | **Review, levers, roads** (`docs/DESIGN.md` §17). The author: "i agree to all" (review, rebalance, measure the untested levers, polish, expand). Eight bugs from a code review fixed; the bot now uses the retreat, incitement, gold and demanded provinces; inciting a frontier you hold part of is no longer allowed; booty after pitched battles; military absorbs beaten legions and levies cheaper; charisma draws wavering legions and appeals better. Legionary hold 12 → 14 months. Balance: Legionary 35%, Centurion 15%, Legate 5.0%. Open: military road trails (about 10% on Centurion against 14–22%). |
| 2026-10-26 | **Offline fonts and save fixtures.** The author: "Fonts load from Google, so offline play falls back to plain fonts. There are no save fixtures yet, so the next save-format change has nothing to test against." Fonts now ship in `fonts/` and are precached by the service worker; `tools/offline.mjs` cuts the network and checks. Save format v2 with a real migration from v1; 15 fixtures (Phase 2, first playtest, depth builds; five moments each) checked by `tools/check-saves.js` in `npm run check`. |
| 2026-10-26 | **Depth** (`docs/FRAME-DEPTH.md`, `docs/DESIGN.md` §16). The author: "continue building depth in story, mechanics, systems, interactions with other powers, outside diplomacy, the senate, and trade." Built: the Senate (favour, one motion a month, public enemies, AI emperors outlaw rivals); five peoples beyond the frontiers (subsidy, incitement, Parthian friendship); trade (six goods with effects, markets, agreements at peace); rival personalities, trade, gold for truces, demanded provinces; 21 more events with chains; emperor and death pages; a Powers tab. Balance: Legionary 38%, Centurion 16%, Legate 4.7%. Open: road spread wider (Centurion military 6%, politics 27%). |
| 2026-10-26 | **First playtest, answered** (`docs/FRAME-PLAYTEST1.md`, `docs/DESIGN.md` §15). The author: "The money aspect is tough in the first province... There should be a retreat option that takes me back to my nearest controlled province... it would be nice if I could control multiple armies, like if I get a general to swear to me... Every month should have a overview page... It definitely needs a bit more story in it." Built: a province taken from the Senate gives up its treasury and the legions' pay chest; legions in their own province cost 60% pay; a legate's salary in Act I; being attacked now asks you (stand or fall back toward your nearest province); Sound the retreat on the field; generals who swear to you and command armies of their own (no more automatic gathering); the Army tab rebuilt around armies, garrisons and generals; Build and Forces on the overview and the provinces list; promises show their due month and can be half-paid once for three more months; a one-screen month report; a "Now" line on every screen; opening pages, act pages and 17 character events with choices; name field readable on dark-mode phones. Balance: Legionary 39%, Centurion 15%, Legate 4.8% (Legate rival funds 2.6 → 2.3). |
| 2026-10-24 | **Phase 2 calibration build** (`docs/DESIGN.md` §14). The author: "Continue." The field (one resolver, line relief, pila, flanks, reserve, cavalry, legate actions; careful play 58% vs auto 45% in even battles); eight provincial works and governors, each work shown to matter; plots warned a month ahead; supply limit of eight legions per army; Act I dead end and map fixed. Balance: Legionary 37%, Centurion 15%, Legate 4.6%. Awaiting the author's verdict on the three calibration pieces. |
| 2026-10-24 | **Phase 0 proposal** (`docs/DESIGN.md`, `docs/FRAME-BATTLE.md`, `docs/ECONOMY.md`, `docs/style-tile.html`). The author: "For the colour scheme I want scarlet, gold, purple, grey, silver, and red/crimson to be the general palette... Use light grey to help mellow out screens if there is too much colour." "Big battles should definitely have a tactical battle screen with an animated pixel map... controlling your legion(s) should be used through a set of buttons for orders... Don't make it the same as Vikingr." "I want the management screens for provinces to feel something like crusader Kings or total war." Proposed: shape B stack; the field (three sectors, line relief, pila, flanks, appeals across the lines; about 20–25 taps a battle); province screens with taxes, buildings, forces and governors; the whispers meter for conspiracies; March past replacing bypass. Awaiting approval. |
| 2026-10-24 | **Kill gate run** (`docs/KILLGATE.md`, 4,200 campaigns). The author: "Go ahead." Measured: Legionary 33.7%, Centurion 13.7%, Legate 5.2%, every road 4.3–6.3% on Legate, every start 3.0–8.5% on Legate. Design changes from the findings: walled towns, raiders and brigands (money settled everything: buy-only beat every road at 31–35%); fickle bought legions and pre-battle outbidding; the hold as its own game (86% of Legate runs that took Rome had won; now 27–56% of Rome-takers still lose); Act IV fixed to July 69 (the spec contradicted itself); recognition by terror; non-historical rivals fold into a claimant when Act IV opens. Six open issues carried to Stage 3. |
| 2026-10-24 | **Four roads.** The author: "Players should be able to look at this game and complete it in multiple ways, like being rich, militarily powerful, politically powerful, and charismatic." One win condition, four roads (§12), each tied to a stat and an encounter option, each with its own way to hold Rome. Kill gate must show each road winning at Legate. |
| 2026-10-24 | **Background.** The author: "Have the background of like early life and other positions help to help determine stats and friends. Through a few choices or such." Seven choices along the cursus honorum set stats, friends and enemies (§13). |
| 2026-10-24 | **Difficulty.** The author: "Make 3 difficult levels with different amounts of rivals, along other affects. Legionnaire, Centurion, Legate. Legate should be at the 5% win rate, each other is easier." Three levels (§14); Legate at 5%; easier targets proposed at 15% and 35%. |
| 2026-10-24 | **Small fights.** The author: "Huge battles may be rare, but I want to see lots of smaller fights. If you can't buy out a garrison or legion, they'll need to be negotiated with or fought." Encounter model with buy / negotiate / fight / bypass; target 30–50 small fights and 3–5 large battles per campaign. |
| 2026-10-24 | **Rivals.** The author: "There should be plenty of other rivals coming up in every act, but only the 4 historical ones make it to the last act, and you are the unhistorical 5th." Anchoring rule: historical claimants defeated, not killed, before Act IV. |
| 2026-10-24 | **Map.** The author: "The map of Rome at the time should be the full map, with the historical number of provinces." About 37 provinces plus four Italy regions, with depth by tier. |
| 2026-10-24 | **Win condition.** Take Rome, gain Senate recognition, hold for 18 months (12 or 24 by difficulty). Approved by the author. Superseded by the difficulty table: 12 / 18 / 24 months. |
