# Frame: the field (large battles)

## The author's request

> "Big battles should definitely have a tactical battle screen with an animated
> pixel map to show basic locations of your cohorts. It should be interactive to
> view which cohorts are which, their troop count left, their morale, their ammo
> and/or endurance. But controlling your legion(s) should be used through a set
> of buttons for orders, something that doesn't make the whole process dragged
> out and tedious or too complex. But it has to be fun and tactical too. I don't
> want it to be too easy, just streamlined. Don't make it the same as Vikingr."

## The problem

The kill gate resolves a Bedriacum like a skirmish: one roll with higher
stakes. Large battles are where the war is decided (3–5 per campaign), so they
need a layer where play beats arithmetic. They must also stay short: a
campaign has several, and each must take minutes, not half an hour.

## What decided Roman battles (and so what the player decides)

1. **Endurance and relief.** Fighting at the front exhausted men in minutes.
   The Roman edge was the *triplex acies*: three lines of cohorts, so tired
   front cohorts could fall back through the gaps and fresh ones take their
   place. When to relieve, and how many reliefs you have left, is the clock of
   the battle.
2. **Pila.** Each legionary carried two throwing spears. A volley just before
   contact broke shields and nerve. Thrown too early it falls short; thrown too
   late it is never thrown.
3. **Flanks.** A line that is overlapped or turned collapses from the end. The
   wings, the cavalry and the reserve decide whether it happens to you or to
   them.
4. **Nerve.** Men broke long before they died. Morale falls with losses, with a
   neighbouring sector giving way, with a flank turned, with the eagle in
   danger; it rises with the legate's presence and with a good volley.
5. **This is a civil war.** Both sides are Romans, often from legions that served
   together. At Second Bedriacum the armies fought through the night, and men
   called across the lines. Some cohorts can be talked over mid-battle.

## How it differs from Vikingr's shield-wall

| | Vikingr shield-wall | Imperator: the field |
|---|---|---|
| What you see | Two lines facing each other | A pixel battlefield: cohorts in three lines, wings, cavalry, terrain |
| What you command | One line, one order a round | Three sectors (left, centre, right) plus reserve, cavalry and the legate, all in one round |
| The enemy's move | Shown before you choose (read against guile) | Not shown. You know his general's character and can see his formation and state, not his intent |
| The clock | Breath and ground | Endurance per cohort, reliefs left per sector, pila left, and daylight |
| The core decision | Which order answers his shown move | Where to spend limited reliefs, volleys and reserves across three sectors at once |
| Special to the period | Single combat, the hero's place in the wall | Line relief, the pila volley, appeals across the lines |

## The screen

**Top two-thirds: the field.** A pixel map, about 96×64 tiles drawn at 4× on a
phone (384×256). Terrain is the real battle's ground where known: the Via
Postumia and its vineyards and ditches at Bedriacum, the Po, the walls of
Cremona. Each **cohort is a small block** in its legion's shield colour, with
a standard sprite for each legion's eagle.

- Animation, about 12 fps:
  - Blocks march.
  - Pila volleys arc as pixel streaks.
  - Lines jostle in contact.
  - Blocks thin as men fall.
  - Relieved cohorts pass back through the gaps.
  - Routing cohorts stream off the map.
  - Reduced motion shows still frames.
- **Tap any cohort** for its card:
  - Legion and cohort (*Legio XIII Gemina, cohort IV, first line*).
  - Men, for example 412 of 480.
  - Morale and endurance bars.
  - Pila left (2, 1 or 0); arrows or sling bullets for auxiliaries.
  - State: fresh, engaged, tired, wavering, routing.
  - A loyalty marker if it is wavering.
- **Enemy cohorts** show what you could see from the field: men as a rough
  band, fresh or tired, morale as a band if your scouts or experience allow.

**Bottom third: orders.** A row of sector chips: **Left · Centre · Right ·
Reserve · Cavalry · Legate**. Tap a chip, tap an order. Every chip keeps its
last order, so a quiet round is one tap: **Sound the trumpets**.

## Orders

### Sector orders (left, centre, right), six buttons

| Order | Does | Costs | Good against | Bad against |
|---|---|---|---|---|
| **Hold** | Brace and dress ranks; rear lines recover a little | Ground if pressed hard | A charge | A volley (standing targets) |
| **Advance** | Close the distance; in contact, press forward | Endurance | A sector falling back | A volley as you come in |
| **Pila** | Throw a volley (needs near range, uses one of two) | One volley | Men advancing into it | Nothing at contact: lines are locked |
| **Charge** | Shock attack into contact | Heavy endurance | A line in the middle of a relief; a line just hit by pila | A braced line (Hold) |
| **Relieve** | Fresh cohorts of the next line to the front (two reliefs per sector) | One relief | Outlasting a grinding fight | A charge that catches the swap |
| **Fall back** | Give ground one band | Morale, ground | A charge that hits air (if reserve or cavalry is near) | Being pressed with nothing behind you |

Buttons say what the order **does and costs**, not what will happen. A
disabled button names the reason ("Too close: the lines are locked").

### Reserve
**Hold back**, or **commit** to left, centre or right: two cohorts per
uncommitted legion, fresh, once.

### Cavalry, one per wing
**Screen the flank** (stops their cavalry turning yours), **Charge the flank**
(needs their flank open or their cavalry beaten), **Pursue** (turns a rout into
a slaughter, but leaves your flank bare).

### The legate, one action a round
- **Ride to a sector:** raises morale there. Small risk to your life.
- **Rally:** stops a rout in one sector, once per battle.
- **Appeal across the lines** (charisma): call on a wavering enemy cohort by
  its legion's old service. It may lower its standards or change sides. Only
  cohorts with low loyalty, and better if your tribunate was with their legion.
- **Signal the ruse** (military): set up a feigned retreat this round. Next
  round, a sector's Fall back becomes a trap if they pursue. Once per battle.

These tie the four roads into battle: charisma appeals, military ruses,
politics brings better-paid and more loyal cohorts, wealth brings more of
them.

## A round

A round is about an hour. **Six rounds of daylight;** at dusk you may break
off or fight on into the night. Night rounds have higher variance and more
confusion, and appeals are easier: men could hear each other.

Order of resolution, simultaneous for both sides:
1. Movement (advance, fall back, relief swaps, reserve arrives).
2. Missiles (pila, auxiliary archers and slingers).
3. Shock and melee by sector, compared order against order using the table
   above. Chance moves numbers ±15%; it never decides what beats what.
4. Flanks: a sector whose neighbour routed or whose flank is turned takes a
   morale and a power penalty.
5. Morale checks: wavering below 25, routing below 10.
6. The army breaks when two sectors' front lines rout, or its total morale
   collapses. The other side holds the field.

**Endurance:** contact drains 15–30 a round, more for Charge. Below 30 a cohort
fights at reduced strength. Relief swaps a tired front cohort for a fresh one
from the line behind.

**The enemy general** has a character, known before the battle from
dispatches:

| Type | Example | Tendency |
|---|---|---|
| Impetuous | Caecina | Charges early, relieves late |
| Methodical | Valens, Suetonius Paulinus | Holds, throws well, relieves on time |
| Cunning | Antonius Primus | Ruses, cavalry on the flank, feints |
| Cautious | Hordeonius Flaccus | Holds, falls back, waits for reserves |

He adapts: repeat the same order in a sector and he answers it.

## Length

- **Six rounds × three to four taps = about 20–25 taps**, roughly 3–5 minutes.
- A round in which nothing changes is one tap.
- **"Leave it to the legates"** auto-resolves with the same resolver under a
  policy, as in every past build. If auto ever beats careful hand play, hand
  play needs a reason to exist.

## Not too easy: targets to measure

Set these before tuning; measure with `measure:battle` on the same seeds.

| Situation | Careful hand play | Auto-resolve | Random orders |
|---|---|---|---|
| Even armies | ~60% | ~45% | ~20% |
| You are outnumbered 2 to 3 | ~35% | ~20% | ~5% |
| You outnumber them 3 to 2 | ~85% | ~70% | ~45% |

- **No order wins alone:** "always charge" and "always hold" should each win
  well under 30% of even battles.
- **Relief is the core decision:** a policy that never relieves should lose
  even battles about 70% of the time.

## A worked example (Second Bedriacum, autumn 69, shortened)

You hold the centre with XIII Gemina and VII Galbiana; your right is on the
road, your left in the vineyards. Their general is impetuous.

1. **Round 1.** Advance in the centre, hold the right, cavalry screen the
   left. They advance too.
2. **Round 2.** Lines at near range. Pila in the centre. Their centre was
   advancing into it: their front cohorts lose men and nerve.
3. **Round 3.** He charges your centre, as impetuous men do. You chose Hold
   in the centre: the braced line takes it, and his front cohorts burn their
   endurance. On your right, Relieve: fresh cohorts in.
4. **Round 4.** His centre is tired. You Charge. On the left, his cavalry
   beats your screen: your left takes a flank penalty. You commit the reserve
   left.
5. **Round 5.** Dusk. Your legate rides to the left; you appeal to a cohort of
   III Gallica that served on the Danube with your tribunate. It lowers its
   standards.
6. **Round 6.** Night. His centre breaks. Pursue with the cavalry, or keep it
   on the flank? Pursuit turns his rout into a slaughter but leaves your left
   bare if his reserve is still there.

## What gets measured

`measure:battle`: the table above, 1,000 battles a cell; order-dominance (each
pure order policy); relief and no-relief; the effect of each general type;
night versus day; and the share of battles decided by appeals (target: under
15%, so it stays a special move).
