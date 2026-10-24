# Economy reference

One table for the engine and the game text, so prices in the prose and
incomes in the engine agree. (Knight of Adalia's incomes were a tenth of
history while its prose prices were historical; nothing made sense until both
followed one table.)

**Status:** draft for Stage 3. Historical anchors are sourced; game values are
marked as game values and get tuned in Phase 1.

## Units

- **The game counts in denarii.** One denarius = 4 sesterces (HS). Roman
  sources and modern estimates usually quote HS; convert at 4:1.
- Shown in the UI as denarii, with thousands as "k" on dense screens.

## Historical anchors

| Item | Value | Source / note |
|---|---|---|
| Legionary pay | 225 denarii a year | Raised to 300 by Domitian (c. 84); 225 throughout 68–71 |
| Praetorian pay | about 750 denarii a year | Roughly 3× legionary; estimates vary |
| A full legion's pay | about 1.1 million denarii a year (≈94k a month) | 5,000 men × 225; officers and auxiliaries extra |
| Praetorians' donative promised in Galba's name | 7,500 denarii a man (30,000 HS) | Plutarch, *Galba* 2; Galba refused to pay |
| Legionaries' donative promised for Galba | 1,250 denarii a man (5,000 HS) | Plutarch, *Galba* 2 (reported; treat as traditional) |
| Rome's grain | Africa about two-thirds of the year, Egypt about one-third | Josephus, *Jewish War* 2.383–386 |
| Revenue of the empire | roughly 800 million – 1 billion HS a year (200–250 million denarii) | Modern estimates (e.g. Duncan-Jones); very uncertain |
| Army's share of the budget | well over half | Same; the reason every emperor needed provinces |

## Game values (provisional, from the kill gate)

| Item | Game value | Note |
|---|---|---|
| Province revenue | 15–420k a month | `sim/data.js`; *collectable in wartime*, a fraction of peacetime yield |
| Legion pay | 94k a month at full strength | Historical |
| Praetorian pay | 3× legionary per man | Historical ratio |
| Praetorian donative on recognition | 1,000 / 1,500 / 2,500k by difficulty | Far below 7,500 a man; see note |
| Donative per legion on acclamation | 90k | Game value |
| Buying a legion | about 280–450k depending on loyalty | Game value |
| Raising a legion | 320k and 4 months | Galba and Macer each raised one in months |
| Letter to a governor | 20k | Game value |

**Note on donatives.** At 7,500 denarii a man, the Praetorians' promised
donative alone (about 70 million denarii) exceeds a year of any one claimant's
revenue in the game. That was the point: it was unpayable, and Galba's refusal
killed him. The game keeps the *ratio* (the Praetorians cost far more per man
than anyone else) and shows the historical promise in the text as the price
that could never be met, while the engine charges a payable game value.
Decision for the author at the calibration stage: keep this, or charge the
historical figure and let paying it be the impossible choice.

## Buildings (Phase 2)

| Building | Cost | Months | Upkeep a month | Effect |
|---|---|---|---|---|
| Road repairs (via) | 120k | 2 | 2k | Faster marches through the province; +5% revenue |
| Granaries (horrea) | 150k | 3 | 3k | Grain stored against shortages; unrest buffer |
| Harbour works (portus) | 220k | 4 | 4k | Winter sailing less costly; grain ships move in winter |
| Stone camp (castra) | 200k | 4 | 4k | Garrison defence; legions stationed here grow loyal and refill their ranks (absorbs the planned arms workshop) |
| Signal towers (limes) | 140k | 3 | 3k | Frontier threat rises more slowly |
| Levy office (dilectus) | 100k | 2 | 2k | Levies faster, cheaper and better drilled here |
| Mint (moneta) | 300k | 5 | 6k | Strikes coin with your face: money and legitimacy (only Lugdunum, Rome, Antioch, Alexandria and Spain had mints) |
| Temple of the imperial cult | 180k | 4 | 3k | Legitimacy; unrest down |
| Amphitheatre games | 120k each time | 1 | — | Unrest down sharply; charisma road's tool |

Costs are game values; they get tuned so a province pays back a building in
roughly a year of campaign, not a decade. The campaign is three or four
years, so these are works a governor could finish in a season, not
monuments.
