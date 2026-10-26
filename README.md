# Imperator

A turn-based strategy game of the Roman civil wars, AD 68–71. You are a
legionary legate who is not in the history books. Win your province, take the
legions, march on Rome against Galba, Otho, Vitellius and Vespasian, and hold
the throne long enough to keep it.

Status: Phase 2 plus the first playtest's fixes: the field, buildings and governors, generals and multiple armies, the month report, story events, the Senate, frontier peoples and trade.

- `docs/SPEC.md` — the design spec and decisions log
- `docs/KILLGATE.md` — what the sim measured, what it changed, open issues
- `docs/PROVINCES.md` — provinces and legions, AD 68–69, with sources (draft, to be verified)
- `sim/` — the kill-gate model (Node, no dependencies)

- `src/` — the game: `engine/` (pure), `data/`, `ui/`
- `tools/` — check, bot, measurement, map builder, icons, phone smoke test

```
npm run serve        # then open http://localhost:8000
npm run check        # invariants, purse == ledger, bot through the player interface
npm run measure -- 20
node tools/smoke.mjs # phone smoke test (Playwright)
```
