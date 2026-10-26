// Put everything the itch.io page needs in one folder and one zip, with the
// upload steps written out (from Knight of Adalia's make-itch-kit.sh).
//
//   node tools/make-itch-kit.mjs --slug=<slug> --name="<Name>" [--itch=docs/itch]
//
// Reads release/ (from build-itch.mjs) and docs/itch/ (cover, shots,
// description.html, short-description.txt, ITCH.md). Writes
// release/itch-kit/ and release/<slug>-itch-kit.zip:
//   1-play-on-the-page/   the web zip            "This file will be played in the browser"
//   2-download/           the single file        Windows, macOS, Linux
//   3-android/            the APK, or a note on where GitHub builds it
//   4-page/               cover, shots, description.html, short description, ITCH.md
//   START-HERE.txt        the order to do it in, and the settings
// Missing pieces are listed, not silently skipped.

import { readdir, readFile, writeFile, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { zip } from './zip.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return [m[1], m[2] ?? true]; }));
const slug = String(args.slug || ''), name = String(args.name || slug), itch = String(args.itch || 'docs/itch');
if (!slug) { console.error('usage: node tools/make-itch-kit.mjs --slug=<slug> --name="<Name>"'); process.exit(2); }
const exists = async (p) => !!(await stat(p).catch(() => null));
const KIT = 'release/itch-kit';
await rm(KIT, { recursive: true, force: true });
const missing = [];
const put = async (from, dir, as) => {
  if (!(await exists(from))) { missing.push(from); return false; }
  await mkdir(join(KIT, dir), { recursive: true });
  await copyFile(from, join(KIT, dir, as || from.split('/').pop()));
  return true;
};

await put(`release/${slug}-web.zip`, '1-play-on-the-page');
// the single-file download is optional (only a bundled build has one)
const hasSingle = (await exists(`release/${slug}.html`)) && (await put(`release/${slug}.html`, '2-download'));
const hasApk = await exists(`release/${slug}.apk`);
await mkdir(join(KIT, '3-android'), { recursive: true });
if (hasApk) await copyFile(`release/${slug}.apk`, join(KIT, '3-android', `${slug}.apk`));
else await writeFile(join(KIT, '3-android', 'GET-THE-APK-FROM-GITHUB.txt'), 'The Android app is built by GitHub on each push (if the game has .github/workflows/android.yml):\nActions > Android app > the latest run > Artifacts. Put it at release/<slug>.apk and re-run this to include it.\n');
const page = (await exists(itch)) ? (await readdir(itch)).filter((f) => /^(cover-630x500\.png|shot\d+-.*\.png|description\.html|short-description\.txt|ITCH\.md)$/.test(f)).sort() : [];
for (const f of page) await put(join(itch, f), '4-page');
for (const need of ['cover-630x500.png', 'description.html', 'short-description.txt', 'ITCH.md']) if (!page.includes(need)) missing.push(`${itch}/${need}`);
if (!page.some((f) => /^shot\d/.test(f))) missing.push(`${itch}/shot1-*.png (node tools/press.mjs)`);

const embed = /\| Embed \|[^\n]*?(\d+ ?x ?\d+)/i.exec(await readFile(join(itch, 'ITCH.md'), 'utf8').catch(() => ''))?.[1];
if (!embed) missing.push(`${itch}/ITCH.md: the Embed size (node tools/embed-measure.mjs)`);
await writeFile(join(KIT, 'START-HERE.txt'), `${name}: itch.io upload kit

On the game's Edit page, Uploads section, in this order:

1. 1-play-on-the-page/${slug}-web.zip
   Kind of project: HTML. Tick "This file will be played in the browser".
   Embed size: ${embed || 'MEASURE IT FIRST'}. Mobile friendly on, Fullscreen button on.
${hasSingle ? `2. 2-download/${slug}.html
   Tick Windows, macOS and Linux. Display name: ${name} (download, opens in any browser).
` : ''}${hasApk ? `${hasSingle ? 3 : 2}. 3-android/${slug}.apk
   Tick Android only. Display name: ${name} (Android).
` : ''}
Then, from 4-page:
- Short description: short-description.txt
- Description: in the editor press the <> button and paste all of description.html
- Cover: cover-630x500.png. Screenshots: the shots, in order.
- Everything else (genre, tags, pricing, AI disclosure, links): ITCH.md
- Links: add the installable copy on GitHub Pages ("Install it to your phone").

Before Public: play the draft in a private window and on a phone, start a game,
copy a save code, reload, load it back. Updates later: upload over the old file.
`);

const walk = async (d) => (await Promise.all((await readdir(d)).map(async (n) => ((await stat(join(d, n))).isDirectory() ? walk(join(d, n)) : [join(d, n)])))).flat();
const files = await walk(KIT);
await writeFile(`release/${slug}-itch-kit.zip`, zip(await Promise.all(files.sort().map(async (f) => ({ name: f.slice(KIT.length + 1), data: await readFile(f) })))));
for (const f of files.sort()) console.log(`  ${f.slice(KIT.length + 1)}`);
console.log(`release/${slug}-itch-kit.zip`);
if (missing.length) { console.log(`\nmissing (${missing.length}):`); for (const m of missing) console.log(`  - ${m}`); process.exitCode = 1; }
