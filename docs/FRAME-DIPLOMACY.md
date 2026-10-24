# Frame: diplomacy

## The author's request

> "Go ahead, make sure this is some diplomacy too."

## The problem

The kill-gate model has two diplomatic acts: letters that turn a neutral
governor, and negotiation with a body in your path. Rivals never deal with you
or with each other. But 68–69 was decided as much by deals as by battles:
- Verginius Rufus refused the throne twice and let others have it.
- Mucianus, governor of Syria, could have been a claimant. He made a pact
  with Vespasian and marched for him.
- The Danube legions chose a side by letter before they chose it by marching.
- Client kings (Agrippa II, Sohaemus of Emesa, Antiochus of Commagene) backed
  Vespasian with men and money.
- Vologases of Parthia offered Vespasian 40,000 mounted archers (Tacitus,
  *Histories* 4.51). Vespasian declined.

## The design rule

Diplomacy is a third way to change the map, alongside money and swords, and
it obeys the same rule as everything else: **rivals use it too, on each
other and on you, with the same functions.**

## Relations

Every pair of factions has a **standing** from −100 to +100. It moves with:
- What they did to each other: battles, broken truces, bribed legions.
- Shared enemies: the strongest claimant draws everyone's hostility on Legate.
- Shared service: your tribunate, legions that served together.
- Your background's friends and enemies.
- Gifts.

Standing and **relative strength** decide whether an offer is accepted. The
diplomacy screen shows both, and the deciding factors in words ("He fears
Vitellius more than you"), never a hidden roll.

## Treaties

| Treaty | Effect | Ends |
|---|---|---|
| **Truce** (6 or 12 months) | Neither side attacks the other's armies or provinces | At term, or broken: the breaker loses legitimacy and everyone's standing with him falls |
| **Alliance against a rival** | A truce, plus both treat the named rival as the main enemy; the AI ally moves on him | When the rival dies or one side breaks it |
| **Submission** | One side folds into the other: legions, provinces and treasury join. The one who submits is promised an office (a consulship, a province) | Permanent. The promise is a debt: unpaid, his old legions grow restless |
| **Hostages** | Added to a truce or alliance. Makes it binding: breaking it costs far more | With the treaty |

## Actions (a few each month, each costs an envoy's time and sometimes money)

| Action | With | Notes |
|---|---|---|
| **Propose a treaty** | Any rival | Truce, alliance against a third rival, or demand submission |
| **Send gifts** | Any rival or client | Money for standing |
| **Subvert a legate** | A rival's legion far from its general | Covert; costs money. If found out: standing collapses and legitimacy falls. The covert twin of buying |
| **Letters to a governor** | Neutral provinces | As in the kill gate; politics writes two a month |
| **Ask a client king for men** | Agrippa II (Judaea), Sohaemus (Emesa), Antiochus (Commagene), Cottius' heirs in the Alps, the Mauretanian chiefs | Auxiliaries for money or recognition. Kings back the strongest claimant near them unless courted |
| **Parthia** | Vologases | Only for a claimant holding Syria. Huge help; huge legitimacy cost: Romans do not bring Parthians into Italy |
| **The Senate** | Rome | A decree naming you legate of the Senate and People (as Galba styled himself) before you hold Rome: legitimacy now, a smaller price at recognition |

## Offers to you

Rivals send offers too, as dispatches with **Accept · Decline · Counter**.
- A weak minor rival may offer to submit.
- A historical claimant may propose a truce while he deals with another.
- On Legate, rivals ally against whoever is strongest, and that may be you.

## The anchor and diplomacy

- Before Act IV, a historical claimant cannot submit to anyone. He is
  anchored, and the four reach the last act.
- From Act IV a historical claimant can submit, but only when his position is
  hopeless. That is how a campaign can end without a final battle: Mucianus's
  road.
- Minor and procedural rivals can submit at any time.
- When Act IV opens, the surviving minor and procedural rivals fold in. They
  prefer an ally or the claimant they stand best with, not only the strongest.

## Each road's diplomacy

| Road | Edge |
|---|---|
| Politics | Envoys succeed more often; can send two a month; the Senate's decree is cheaper |
| Charisma | Standing rises faster; legions from rivals' armies come over when treaties end |
| Wealth | Gifts go further; subverting legates is cheaper |
| Military | Demands for submission carry the weight of recent victories |

## Measurements

- **Diplomacy matters:** removing it should cost the bot win rate on every road,
  and most on politics.
- **It is not a win button:** a policy of truce with everyone must not beat the
  full bot.
- **Kill-gate targets still hold:** win rates by difficulty within noise of
  35 / 15 / 5.
- **AI uses it:** count rival-to-rival treaties per campaign (target: at least
  one in most campaigns, as in 69).
