# Imperator

A turn-based strategy game of the Roman civil wars, AD 68–71. You are a
legionary legate who is not in the history books. Win your province, take the
legions, march on Rome against Galba, Otho, Vitellius and Vespasian, and hold
the throne long enough to keep it.

Status: design, with a numbers-only kill-gate sim. No game UI yet.

- `docs/SPEC.md` — the design spec and decisions log
- `docs/KILLGATE.md` — what the sim measured, what it changed, open issues
- `docs/PROVINCES.md` — provinces and legions, AD 68–69, with sources (draft, to be verified)
- `sim/` — the kill-gate model (Node, no dependencies)

```
npm run check        # invariants
npm run sim -- 50    # win rates by difficulty, road and start
```
