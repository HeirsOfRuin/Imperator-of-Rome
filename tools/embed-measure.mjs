// What embed size should the itch page use? Measure it instead of guessing
// (The Company measured five sizes by hand and never committed the tool).
//
//   node tools/embed-measure.mjs [--site=dist/site] [--start='[data-act="new"]||[data-act="start"]']
//   (--start: the clicks that begin a game, in order, separated by ||)
//
// For each candidate size it loads the game, starts one, and reports: the width
// the game actually uses, the height of the fixed chrome (sticky and fixed bars),
// the content height left to read in, horizontal overflow, and wasted margin.
// The recommendation is the size with the most content height and no overflow
// or waste; ties go to the narrower size (phone-like).

import { launch, serve } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return [m[1], m[2] ?? true]; }));
const SIZES = (args.sizes ? String(args.sizes).split(',').map((s) => s.split('x').map(Number)) : [[360, 640], [390, 844], [480, 820], [600, 800], [800, 820], [960, 760]]);
const START = String(args.start || '[data-act="new"]').split('||');
const { url, close } = await serve(String(args.site || 'dist/site'));
const rows = [];
for (const [w, h] of SIZES) {
  const { browser, page } = await launch({ phone: false });
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url, { waitUntil: 'load' });
  for (const sel of START) if (await page.locator(sel).count()) { await page.locator(sel).first().click(); await page.waitForTimeout(250); }
  const m = await page.evaluate(() => {
    const root = document.querySelector('#app') || document.body;
    const used = Math.round(root.getBoundingClientRect().width);
    let chrome = 0;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      // (offsetParent is always null for position:fixed, so visibility is tested directly)
      if ((cs.position === 'sticky' || cs.position === 'fixed') && cs.display !== 'none' && cs.visibility !== 'hidden') {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height < innerHeight * 0.6 && r.width > innerWidth * 0.5) chrome += r.height;
      }
    }
    return { used, chrome: Math.round(chrome), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  rows.push({ w, h, ...m, content: h - m.chrome, waste: Math.max(0, w - m.used) });
  await browser.close();
}
await close();
console.log('embed      game width  chrome  content  overflow  wasted');
for (const r of rows) console.log(`${`${r.w} x ${r.h}`.padEnd(11)}${String(r.used).padStart(10)}${String(r.chrome).padStart(8)}${String(r.content).padStart(9)}${String(r.overflow).padStart(10)}${String(r.waste).padStart(8)}`);
const ok = rows.filter((r) => r.overflow <= 1 && r.waste <= 40);
const best = ok.sort((a, b) => b.content - a.content || a.w - b.w)[0];
if (best) console.log(`\nRecommended: ${best.w} x ${best.h} (${best.content}px to read in, no overflow, ${best.waste}px unused). Mobile friendly on; fullscreen button on.`);
else console.log('\nNo size without horizontal overflow or wasted margin: fix the layout first.');
