# Frame: depth (Phase 3)

The author, 2026-10-26: "continue building depth in story, mechanics, systems,
interactions with other powers, outside diplomacy, the senate, and trade."

Rule for every addition: it moves a number the rest of the engine reads, the
rivals play by it too, and a measurement shows it is not inert.

## The Senate (`senate.js`)
- **Favour**, 0–100, for every claimant. It drifts toward a level set by
  legitimacy; it moves with gifts, honours, terror, plunder, broken treaties
  and choices in events.
- **One motion a month** (the Senate meets on the Kalends). Motions: the decree
  naming you legate of the Senate and People; proconsular imperium (easier
  recognition); thanksgiving for a victory; declaring a rival a public enemy
  (hostis); the treasury of Saturn (money, at a price in favour); recalling
  Nero's exiles. Each has a favour threshold and a cost in favour or money.
- **The Senate acts.** An emperor with the Senate behind him has his strongest
  disliked rival declared a public enemy. A public enemy cannot be recognised
  as emperor, loses legitimacy, and his legions waver.
- Favour feeds the hold: a friendly Senate means fewer plots.

## Frontier peoples (`foreign.js`)
Five peoples beyond the frontiers, each tied to a frontier's threat: the
Brigantes, the Batavians, the Dacians and Sarmatians, Parthia, the Garamantes.
- **Subsidy**: pay to keep them quiet for six months (their frontier's threat
  rises far more slowly). Needs a province on that frontier.
- **Incite**: pay them to rise against whoever holds that frontier. Threat
  jumps; if you hold part of it, you suffer too; if it is found out, legitimacy
  and the Senate's favour fall (bringing barbarians against Romans).
- **Parthia**: a treaty of friendship for whoever holds Syria. The East goes
  quiet, Parthian horse comes cheaper, and the silk road opens to your markets.
History: Vespasian's party incited Civilis against Vitellius (Tacitus, Hist.
4.13); Vologases offered Vespasian 40,000 horse (Hist. 4.51); the Dacians
crossed when the Moesian legions marched for Italy (Hist. 3.46).

## Trade (`trade.js`)
Six goods, each from the provinces that produced it in the first century:
grain, wine and oil, metal, horses, timber, luxuries.
- **Holding a good** (owning a province that makes it, or a trade agreement
  with someone who does) gives an effect: metal makes levies cheaper and better
  armed; horses strengthen cavalry; timber makes works cheaper; grain feeds
  armies past the supply limit; wine and oil keep legions content; luxuries
  add legitimacy and make games cheaper.
- **Markets**: each good you hold brings merchant income; a harbour adds to it.
- **Trade agreements** with rivals at peace and with Parthia: each side gets the
  other's goods and income for every good it lacked. War ends them.

## Rivals
- New proposals: trade agreement; a truce sweetened with gold; demand a
  province from a much weaker partner.
- Personalities for the four claimants change how they answer: Galba is
  stingy, Otho charming, Vitellius idle, Vespasian patient.

## Story
- About 20 more events, some chained (an answer opens a later event).
- Events from the new systems: the Senate, merchants, frontier peoples, rival
  letters (an offer of retirement, as Otho and Vitellius offered each other),
  your family in Rome.
- Pages when an emperor falls or a new one is recognised.

## Status
Built and measured 2026-10-26: `docs/DESIGN.md` §16.
