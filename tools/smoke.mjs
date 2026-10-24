// Drive the real page in a real browser at phone width. Copy to tools/smoke.mjs
// and fill in ADVANCE / DISMISS / TABS for your game. Run: node tools/smoke.mjs
//
// What this catches that no engine test can (all real, from the eight builds):
// a page that does not parse (two unescaped apostrophes blanked The Company), a
// button that does nothing, a modal eating every click, a screen that renders
// empty, title buttons 650px tall at 390px wide, a layout that broke completely
// at 390px (Touchline had never been looked at on a phone), console errors.
//
// It also proves PROGRESS in the UI: the game clock must advance on every click
// of the advance button, or the run fails.
//
// Playwright is installed globally in Claude cloud sessions with Chromium at
// /opt/pw-browsers; ES modules ignore NODE_PATH, so resolve it by path.

const PW = process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.js';
const pw = await import(PW);
const chromium = pw.chromium || pw.default?.chromium;
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// ---- fill these in -----------------------------------------------------------
const ROOT = process.env.ROOT || process.cwd();          // folder holding index.html (or dist/)
const START = ['[data-act="new"]', '[data-act="start"]'];
const CLOCK = '.hud .turn';
const ADVANCE = '[data-act="end-turn"]';
const DISMISS = ['.modal [data-choice]:not([disabled])', '.modal [data-act="close"]', '.sheet [data-choice]:not([disabled])'];
const TABS = ['[data-tab="map"]', '[data-tab="realm"]', '[data-tab="army"]', '[data-tab="diplomacy"]', '[data-tab="dispatches"]', '[data-tab="legate"]'];
const TURNS = Number(process.env.TURNS || 14);
// ------------------------------------------------------------------------------

const SHOTS = process.env.SHOTS || '/tmp/shots';
await mkdir(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const path = join(ROOT, rel === '/' ? 'index.html' : rel);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const URL0 = `http://localhost:${server.address().port}/index.html?seed=${process.env.SEED || 11}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [];
let failures = 0;
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : '!!  '}${label}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };
const flushErrors = (step) => { const e = [...new Set(errors.splice(0))]; check(`no errors: ${step}`, !e.length, e.slice(0, 5).join(' | ')); };
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

await page.goto(URL0, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${SHOTS}/0-title.png` });
flushErrors('load');
check('no horizontal scroll on title', (await overflow()) <= 1);

for (const sel of START) { await page.click(sel, { timeout: 5000 }); await page.waitForTimeout(150); }
flushErrors('start');

let advanced = 0;
for (let i = 0; i < TURNS; i++) {
  const before = (await page.locator(CLOCK).textContent())?.trim();
  await page.click(ADVANCE, { timeout: 5000 });
  for (let g = 0; g < 6; g++) { // clear modals; a modal that eats clicks should FAIL, not time out
    let clicked = false;
    for (const d of DISMISS) if (await page.locator(d).count()) { await page.locator(d).first().click(); clicked = true; break; }
    if (!clicked) break;
    await page.waitForTimeout(60);
  }
  if (await page.locator('.end').count()) {
    // a campaign that ends is fine: the end screen must render, then start again
    const txt = await page.innerText('.end');
    check(`end screen renders (turn ${i + 1})`, txt.length > 40 && !/undefined|NaN/.test(txt));
    await page.screenshot({ path: `${SHOTS}/end.png` });
    await page.click('[data-act="new"]'); await page.click('[data-act="start"]'); await page.waitForTimeout(100);
    advanced++; continue;
  }
  const after = (await page.locator(CLOCK).textContent())?.trim();
  if (after === before) { check(`clock advanced on turn ${i + 1}`, false, `stuck at "${before}"`); break; }
  advanced++;
}
check(`played ${advanced}/${TURNS} turns through the UI`, advanced === TURNS);
await page.screenshot({ path: `${SHOTS}/1-played.png` });
flushErrors('turns');

for (const t of TABS) {
  if (!(await page.locator(t).count())) { check(`tab ${t} exists`, false); continue; }
  await page.click(t);
  await page.waitForTimeout(80);
  const text = (await page.locator('main, #app, body').first().innerText()).trim();
  check(`tab ${t} renders`, text.length > 40, `${text.length} chars`);
  check(`tab ${t} no horizontal scroll`, (await overflow()) <= 1);
  // Raw template tokens reaching the screen ("Back {lt}" shipped in The Company).
  const raw = text.match(/\{[a-z_.]+\}|undefined|NaN|\[object Object\]/g);
  check(`tab ${t} no raw tokens`, !raw, raw ? raw.slice(0, 3).join(' ') : '');
  await page.screenshot({ path: `${SHOTS}/tab-${t.replace(/\W+/g, '')}.png` });
}
flushErrors('tabs');

// Save round trip: reload must land in the same game.
const clockBefore = (await page.locator(CLOCK).textContent())?.trim();
await page.reload({ waitUntil: 'networkidle' });
const cont = page.locator('[data-act="continue"]');
if (await cont.count()) await cont.click();
check('save survives reload', (await page.locator(CLOCK).textContent())?.trim() === clockBefore);

await browser.close();
server.close();
console.log(`\n${failures ? `${failures} FAILURE(S)` : 'smoke clean'} — screenshots in ${SHOTS}. LOOK at them.`);
process.exit(failures ? 1 : 0);
