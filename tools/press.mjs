// Store art from the shipped build: a cover and screenshots of the real game,
// driven through its own screens, so the store page cannot drift from the game
// (The Company's cover device comes out of the game's own drawBanner()).
//
//   node tools/press.mjs [tools/press.config.mjs]
//
// The config (templates/press.config.mjs) names the site, the shot size (use
// the measured embed size), a cover HTML page, and each shot as a function that
// drives the page to the moment worth showing: seed a save, clear first-visit
// hints, click through. Writes docs/itch/: cover-630x500.png (at 2x),
// cover-preview-315x250.png (how browse listings show it: CHECK IT), the shots,
// and press-sheet.png with everything side by side to look at once.
//
// Two lessons it encodes: seed a believable mid-game state (Silk Road's first
// shot read "33 of 10 loads", which looks like a bug on a store page), and look
// at the cover at listing size. A transient toast covered every Imperator shot
// until `hide` removed it: look at the press sheet.

import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import { launch, serve } from './browser.mjs';

const cfgPath = resolve(process.argv[2] || 'tools/press.config.mjs');
const cfg = (await import(pathToFileURL(cfgPath).href)).default;
const OUT = cfg.out || 'docs/itch';
await mkdir(OUT, { recursive: true });
const { url, close } = await serve(cfg.site || 'dist/site');
const { browser } = await launch({ phone: false });
const made = [];

// ---- the cover
if (cfg.cover) {
  const page = await browser.newPage({ viewport: { width: 630, height: 500 }, deviceScaleFactor: 2 });
  const html = await readFile(cfg.cover, 'utf8');
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: join(OUT, 'cover-630x500.png') });
  await page.setViewportSize({ width: 630, height: 500 });
  const small = await browser.newPage({ viewport: { width: 315, height: 250 }, deviceScaleFactor: 1 });
  await small.setContent(`<body style="margin:0"><img src="data:image/png;base64,${(await page.screenshot()).toString('base64')}" style="width:315px;height:250px"></body>`);
  await small.screenshot({ path: join(OUT, 'cover-preview-315x250.png') });
  made.push('cover-630x500.png', 'cover-preview-315x250.png');
  await page.close(); await small.close();
}

// ---- the shots
const [w, h] = cfg.size || [480, 820];
for (const [i, shot] of (cfg.shots || []).entries()) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await shot.drive({ page, url, reload: () => page.reload({ waitUntil: 'load' }) });
  // transient things (toasts, first-visit hints) cover the shot: cfg.hide lists their selectors
  if (cfg.hide?.length) await page.addStyleTag({ content: `${cfg.hide.join(',')} { display: none !important; }` });
  await page.evaluate(() => document.fonts?.ready);
  const file = `shot${i + 1}-${shot.name}.png`;
  await page.screenshot({ path: join(OUT, file) });
  made.push(file);
  await context.close();
}

// ---- one sheet to look at
const sheet = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const imgs = await Promise.all(made.filter((f) => !f.includes('preview')).map(async (f) => `<figure><img src="data:image/png;base64,${(await readFile(join(OUT, f))).toString('base64')}"><figcaption>${f}</figcaption></figure>`));
await sheet.setContent(`<body style="margin:12px;background:#222;color:#ddd;font:12px system-ui;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
  <style>img{height:420px;display:block}figure{margin:0}</style>${imgs.join('')}</body>`);
await sheet.screenshot({ path: join(OUT, 'press-sheet.png'), fullPage: true });
await browser.close();
await close();
for (const f of made) console.log(`${OUT}/${f}`);
console.log(`${OUT}/press-sheet.png  everything side by side. Look at it, and at the cover preview at listing size.`);
