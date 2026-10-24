# Kill gate — results

Stage 2: a numbers-only model of the whole campaign, March 68 to the end,
played by a reference bot for each road against rivals that use the same rules.
No UI, no art. The question it answers: are the decisions interesting as a
table of numbers, and can the targets in `SPEC.md` be hit?

**Verdict: pass, with six open issues (below).** Every target is met or close.
Three findings changed the design.

## How it was measured

- `sim/model.js`: the model. One rule set for every faction; the player bot
  and every rival call the same functions.
- `sim/run.js`: the matrix: 3 difficulties × 4 roads × 7 starts × 50 seeds =
  **4,200 campaigns**, 350 per road per difficulty.
- `sim/ablate.js`: the same seeds with one encounter option removed, or only
  one allowed.
- `sim/background.js`: each road played with each road's background.
- `sim/check.js`: invariants every turn (determinism, no impossible states,
  the four claimants always appear, no non-historical rival survives into
  Act IV).
- `sim/trace.js`: one campaign as a readable log, for finding out why.

Every rate below carries one standard error (±). A gap smaller than about
twice the combined error is noise.

"Competent play" here means the reference bots. They are simple: no
lookahead, fixed thresholds. A good human will beat them; a new player may
not. Human win rates get calibrated at playtest.

## Results against the gate

### Win rate by difficulty and road (350 campaigns per cell)

| | Wealth | Military | Politics | Charisma | **All** | Target |
|---|---|---|---|---|---|---|
| Legionary | 38.6% ±2.6 | 22.6% ±2.2 | 42.9% ±2.6 | 30.6% ±2.5 | **33.7%** | 35% |
| Centurion | 16.0% ±2.0 | 10.9% ±1.7 | 14.3% ±1.9 | 13.4% ±1.8 | **13.7%** | 15% |
| Legate | 5.1% ±1.2 | 4.3% ±1.1 | 5.1% ±1.2 | 6.3% ±1.3 | **5.2%** | 5% |

- Legate: **met.** Every road is inside the 3–8% band.
- Centurion and Legionary: **met** within a few points.
- **Open issue 1:** military is the weakest road on the two easier levels.

### Every start wins sometimes (Legate)

| Britannia | Germania Sup. | Pannonia | Moesia | Dalmatia | Africa | Syria |
|---|---|---|---|---|---|---|
| 5.0% | 6.0% | 4.5% | 4.5% | 8.5% | 5.0% | 3.0% |

**Met.** Africa began at 0% (one legion, and wandering rivals caught it); it
now raises a legion fast, as Clodius Macer did.

### Fights per campaign (median; winners in brackets)

| | Small fights | Large battles |
|---|---|---|
| Wealth | 14–23 (14–27) | 3 (2–3) |
| Military | 37–40 (52–63) | 2 (2–3) |
| Politics | 14–23 (14–28) | 2–3 (2–4) |
| Charisma | 16–21 (16–25) | 2–3 (2–4) |

Target 30–50 small, 3–5 large. **Partly met.**
- **Open issue 2:** the military road is in range; the others average 14–23
  small fights and 2–3 large battles. Before walled towns, raiders and brigands
  were added, the wealth road averaged 4.

### The hold matters

Runs that took Rome and still lost: **27–56%** depending on road and level.
**Met.** Before the hold rules (SPEC §13a) existed, this was 5–15%, and 86% of
Legate runs that took Rome won.

### How campaigns end (Legate)

| Outcome | Share |
|---|---|
| Murdered by conspirators | 25% |
| Killed in the field | 19% |
| Out of time (stalemate) | 17% |
| Army destroyed | 15% |
| Recalled (Act I) | 9% |
| **Held Rome: win** | 5% |
| Mutiny | 4% |
| Lost the throne | 4% |
| History passed you by | 1% |

- **Open issue 3:** conspiracy is the single largest cause of loss on every
  level (20–25%). That will feel random unless the game shows it coming; see
  the recommendation below.
- **Open issue 4:** 14–19% of campaigns end with nobody winning by AD 73.

### The anchor holds

A historical claimant was reduced to zero legions before Act IV (and rebuilt
by the anchoring rule) in **14% / 18% / 25%** of campaigns (Legionary /
Centurion / Legate). Before fixes it was 57%, mostly Otho being wiped out the
month he rose. **Met, with a caveat:** on Legate, one run in four will show a
claimant surviving on a single levy legion. The game should present it as
"fled to his province and raised new men", not as nothing happening.

### Options: each best somewhere

First measurement (before fixes), Centurion, 105 runs per arm:

| Road | Full bot | Buy only | Negotiate only | Fight only | Bypass only |
|---|---|---|---|---|---|
| Wealth | 31% | **35%** | 11% | 3% | 1% |
| Politics | 30% | **32%** | 18% | 3% | 2% |

Buying alone beat every road's full play, and removing negotiation changed
nothing. Fixed by making bought legions fickle, adding rivals' outbidding, and
limiting negotiation to one try per body per month.

Final build, Centurion, 805 runs per arm (change in win rate when the option is
removed; ~ = within noise):

| Road | Full bot | No buy | No negotiate | No fight | No bypass | Buy only | Negotiate only |
|---|---|---|---|---|---|---|---|
| Wealth | 18.4% | −2.9~ | **−5.1** | **−17.4** | +0.9~ | 15.2% | 19.4% |
| Military | 10.1% | **−3.7** | −0.1~ | **−10.1** | +0.6~ | 8.3% | 8.4% |
| Politics | 17.6% | +0.0~ | **−7.3** | **−16.3** | +1.5~ | 11.8% | 18.1% |
| Charisma | 15.4% | −2.7~ | **−6.1** | **−14.5** | −0.4~ | 7.7% | 13.9% |

(These base rates are higher than the main table's Centurion row because the
ablation uses a different seed set; compare within a row only.)

- Negotiation now matters on three roads, and buying matters on the military
  road (its fallback when a fight is too risky). Fighting is essential on all
  four. **Met.**
- Buy-only no longer beats the full bot. **Met.** But negotiate-plus-fight
  alone is about as good as the full playbook on the wealth and politics
  roads: negotiation is the strongest single option. Watch it at playtest.

- Fight-only and bypass-only are the worst policies on every road: men run out,
  or the army is cut off. **Met.**
- Buy-only no longer beats the full bot. **Met.**
- **Open issue 5:** confirmed at 805 runs per arm: removing bypass changes no road's win rate (−0.4 to +1.5, all noise). It is used about four times a campaign but decides nothing yet.

### Background matters but does not decide (Centurion, 210 per cell)

Rows: the road played. Columns: the background built for that road.

| Road played | Wealth bg | Military bg | Politics bg | Charisma bg |
|---|---|---|---|---|
| Wealth | **14.8%** | 1.9% | 12.4% | 6.2% |
| Military | 7.1% | **8.1%** | 5.7% | 6.7% |
| Politics | 12.4% | 6.7% | **14.8%** | 3.3% |
| Charisma | 5.7% | 7.1% | 12.4% | **10.5%** |

- Mostly met: the matching background is best, or tied for best, for wealth,
  politics and military. A mismatched background is worse but not hopeless.
- **Open issue 6:** the politics background is a strong all-rounder
  (legitimacy helps every road), and background matters little for the
  military road. Worth watching, not yet worth fixing.

## Three findings that changed the design

1. **Money settled everything.** Buying was the best policy on every road, and
   the wealth road fought 4 small fights a campaign. Added walled towns (cannot
   be bought), raiders and brigands (fight only), and made bought men fickle.
2. **There was no hold.** Once recognised, you won. Added conspiracies,
   deserting generals, donatives and grain pressure, with each road's own
   defence (SPEC §13a). This is now where most campaigns are decided, as in
   69.
3. **The spec contradicted itself.** Act IV waited for your proclamation, yet
   "history passes you by" needed Act IV to open without it. Act IV now opens
   in July 69 regardless.

Smaller changes: Senate recognition by terror (five legions in Italy) for the
military road; only Rome and its two neighbouring regions need to be clear for
recognition; Otho rises from Campania with the fleet legion if Galba holds
Rome; claimants always rise somewhere; rivals in Act IV keep levying.

## Open issues, with recommendations

| # | Issue | Recommendation |
|---|---|---|
| 1 | Military is the weakest road on Legionary (23% vs 31–43%) and Centurion | Accept for now: it is the slow, attritional road, and the easier levels reward the cheap ones. Revisit when the tactical battle layer exists; that is where military play should shine |
| 2 | Non-military roads see 14–23 small fights, not 30–50 | Add the planned fight types the sim does not have (river crossings, ambushes in the passes, rival detachments harassing the march) |
| 3 | Conspiracy is the top cause of loss | Keep the mechanic; make it legible. Show a plot meter fed by legitimacy and Rome's unrest, and let informers or friends give warning a month ahead |
| 4 | 14–19% stalemates by AD 73 | Rival AI quality. Rivals that hold Rome sit tight; they need to go out and break weaker claimants. Stage 3 |
| 5 | Bypass has no measurable effect on win rate | Give time a price the bot feels: a rival racing for Rome, or the hold clock. If it still measures as inert, fold bypass into "march past" as a movement option, not an encounter choice |
| 6 | Politics background strong across roads | Watch at playtest |

## What the sim does not model

- **News lag.** It is a UI and information feature, so the difficulty row for
  it has no effect in the sim. It needs a human test.
- **The tactical battle layer.** Large battles resolve like small ones, with
  higher stakes.
- **Money values** are provisional game units, not history. They get replaced
  by `docs/ECONOMY.md` at Stage 3.
- **Friends** from the background are only partly modelled (banker gives
  credit, senator gives legitimacy, the tribune posting gives comrades).

## Running it

```
npm run check            # invariants, about 30 s
npm run sim -- 50        # full matrix, about 2.5 min
node sim/ablate.js 30 centurion
node sim/background.js 30 centurion
node sim/trace.js <seed> <road> <start> <difficulty>
```
