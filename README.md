# Imperator

A turn-based strategy game of the Roman civil wars, AD 68–71. You are a
legionary legate who is not in the history books. Win your province, take the
legions, march on Rome against Galba, Otho, Vitellius and Vespasian, and hold
the throne long enough to keep it.

Status: Phase 2 plus the first playtest's fixes: the field, buildings and governors, generals and multiple armies, the month report, story events, the Senate, frontier peoples and trade.

- `docs/SPEC.md` — the design spec and decisions log
- `docs/KILLGATE.md` — what the sim measured, what it changed, open issues
- `docs/PROVINCES.md` — provinces and legions, AD 68–69, with sources (draft, to be verified)
- `prototypes/killgate/` — the kill-gate model (the Stage 2 record; `npm run killgate`)
- `sim/` — measurement: the game-measure kit and `sim/adapter.js`; questions in `sim/ablations/`, `sim/curves/`, `sim/claims.js`

- `src/` — the game: `engine/` (pure), `data/`, `ui/`
- `tools/` — check, bot, measurement, map builder, icons, phone smoke test

```
npm run serve        # then open http://localhost:8000
npm run check        # invariants, purse == ledger, bot through the player interface
npm run measure -- --runs=20   # win rate by difficulty x road, ±1 SE
npm run measure:depth          # ablations: depth, diplomacy, buildings, options
node tools/smoke.mjs # phone smoke test (Playwright)
```
