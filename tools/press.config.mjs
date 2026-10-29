// What tools/press.mjs photographs for the itch page: the real build, driven
// through its own screens (selectors from tools/smoke.mjs). Seed 11 is the
// smoke test's campaign, so the shots show a game that is known to play.
const DISMISS = ['.page button[data-a]:not([disabled])', '.battle button[data-a*="battleAuto"]', '.battle .card button[data-a*="battleRound"]', '.modal [data-choice]:not([disabled])', '.modal [data-act="close"]', '.sheet [data-choice]:not([disabled])'];

async function clear(page) {
  for (let g = 0; g < 10; g++) {
    let clicked = false;
    for (const d of DISMISS) if (await page.locator(d).count()) { await page.locator(d).first().click(); clicked = true; break; }
    if (!clicked) return;
    await page.waitForTimeout(60);
  }
}
async function months(page, n) {
  await page.goto(page.url().split('?')[0] + '?seed=11', { waitUntil: 'load' });
  await page.click('[data-act="new"]');
  // "I know the way": the first-months guide covered the top of the map and army shots
  await page.click(`[data-ng='{"guide":false}']`);
  await page.click('[data-act="start"]');
  for (let i = 0; i < n; i++) { await clear(page); await page.click('[data-act="end-turn"]'); await clear(page); }
}

export default {
  site: 'dist/site',
  size: [390, 844],             // measured: tools/embed-measure.mjs
  cover: 'docs/itch/cover.html',
  hide: ['.toast'],
  shots: [
    { name: 'the-empire', async drive({ page }) { await months(page, 6); await page.click('[data-tab="map"]'); } },
    { name: 'the-army', async drive({ page }) { await months(page, 6); await page.click('[data-tab="army"]'); } },
    { name: 'diplomacy', async drive({ page }) { await months(page, 8); await page.click('[data-tab="diplomacy"]'); } },
  ],
};
