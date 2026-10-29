# Imperator — itch.io page kit

Everything needed to put the game on itch.io, and the things that are a
decision rather than a task. Copy to `docs/itch/ITCH.md` and fill the blanks.
Every count in the copy is read out of the build, not from memory.

## Files

| File | What it is | Built by |
|---|---|---|
| `release/imperator-web.zip` | The game, played on the page (index.html at the zip root, no service worker) | `node tools/build-itch.mjs` |
| `release/imperator.apk` | Android app (optional) | GitHub Actions, `android.yml` |
| `release/imperator-itch-kit.zip` | All of the above, the page text and images, and START-HERE.txt | `node tools/make-itch-kit.mjs` |

## Upload settings

| Field | Value |
|---|---|
| Kind of project | HTML |
| Upload 1 (played on the page) | `imperator-web.zip`, tick "This file will be played in the browser" |
| Embed | **390 x 844** (measured with `node tools/embed-measure.mjs`; paste its table below) |
| Mobile friendly | On, orientation portrait |
| Fullscreen button | On |
| Automatically start on page load | Off (a title screen is the start) |
| Classification | Games |
| Release status | In development |
| Pricing | No payments |
| Genre | Strategy |
| Tags | historical, roman, turn-based-strategy, grand-strategy, singleplayer, pixel-art, mobile, offline |
| Cover | `cover-630x500.png` (check `cover-preview-315x250.png`: that is how browse listings show it) |
| Screenshots | 3–5: the loop, the tactics, a consequence; no two alike |
| Links | The installable copy: https://heirsofruin.github.io/Imperator-of-Rome/ |
| Community | Comments on, so players can post save codes with bug reports |

Embed measurement (`node tools/embed-measure.mjs`):

```
embed      game width  chrome  content  overflow  wasted
360 x 640         360      34      606         0       0
390 x 844         390      34      810         0       0
480 x 820         480      34      786         0       0
600 x 800         560      34      766         0      40
800 x 820         560      34      786         0     240
960 x 760         560      34      726         0     400
```

## AI disclosure

itch asks whether the project uses generative AI, and for which parts. Say
plainly what was generated and what was yours. Tick the boxes that apply (Text,
Graphics, Code, Sound). Suggested wording, to adjust to your own:

> Made with AI assistance. I designed the game, its systems and its world, and
> directed, edited and play-tested it; the code, the text and the drawn art were
> generated with an AI model to that design.

## Short description (the one-line field, under ~120 characters)

> A turn-based strategy game of the Roman civil wars, AD 68-71.

## Known constraints (say them on the page)

- Saves live in this browser. If a browser blocks site data in embedded frames,
  open the game fullscreen or use the save code (Menu).
- Saves on itch and in the installed copy are separate; the save code moves a game.
- Not yet calibrated with human players. The bot's targets are about 35 / 15 / 5% wins on Legionary / Centurion / Legate: start on Legionary.

## Before going public

- [ ] `npm run check` green on the commit being released
- [ ] `node tools/pre-public.mjs --zip=release/imperator-web.zip` clean (the zip in an itch-style frame, storage blocked and allowed; copy checks)
- [ ] `node tools/update-check.mjs` clean (a new deploy reaches someone who already has the app)
- [ ] Every number in the description confirmed against the build (pre-public lists them)
- [ ] Tutorial and help re-read against the build
- [ ] Cover checked at 315 x 250; shots looked at on the press sheet
- [ ] Played the uploaded draft yourself, in a private window and on a phone: start, a few turns, copy a save code, reload, load it
- [ ] Then Public

## After publishing

Watch the comments the first week; ask for a save code with every bug report.
Each fix: rebuild, `build-itch.mjs`, upload over the old file (the page stays);
a devlog for anything players would notice (`devlog.md`).
