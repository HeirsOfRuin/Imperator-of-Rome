// Do the builds actually work? Run after the build.
//   1. the single file (if this shape makes one) opened from file:// plays turns with no errors
//      (a bundler that writes a file is not a bundler that writes a working
//      one: Centennial Farm's first bundle did not parse).
//   2. the site (dist/site/) served over http: the manifest parses, every icon resolves,
//      a maskable icon exists, the service worker activates and controls the
//      page, the page reloads and plays with the network off, and the worker's
//      cache carries the build id.

import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { launch, serve, checker, overflow } from './browser.mjs';
// The smoke test's adapter (START, advanceOnce) drives one turn; a game whose
// smoke.mjs predates that adapter still gets every check except "plays a turn".
// (An older smoke.mjs runs on import, so read it before importing it.)
const smokeSrc = await readFile(new URL('./smoke.mjs', import.meta.url), 'utf8').catch(() => '');
const smoke = /export async function advanceOnce/.test(smokeSrc) ? await import('./smoke.mjs') : {};
const { advanceOnce, START = [] } = smoke;

const ck = checker();
const { check } = ck;
const SINGLE = '';
const SITE = process.env.SITE || 'dist/site';

// ---- 1. the single file from disk
if (SINGLE) {
  const single = resolve(SINGLE);
  const { browser, page, errors } = await launch({ phone: true });
  await page.goto(pathToFileURL(single).href);
  if (advanceOnce) {
    for (const sel of START) await page.click(sel, { timeout: 5000 });
    let turns = 0;
    for (let i = 0; i < 6; i++) if (await advanceOnce(page)) turns++;
    check('single file plays from file://', turns === 6, `${turns}/6 turns`);
  } else check('single file renders from file://', (await page.locator('body').innerText()).trim().length > 20);
  check('single file: no errors', !errors.length, errors.slice(0, 3).join(' | '));
  check('single file: no horizontal scroll', (await overflow(page)) <= 1);
  await browser.close();
}

// ---- 2. the installable site
{
  const { url, close } = await serve(SITE);
  const { browser, context, page, errors } = await launch({ phone: true });
  await page.goto(url, { waitUntil: 'load' });
  const man = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
    if (!href) return { error: 'no manifest link' };
    const res = await fetch(href);
    if (!res.ok) return { error: `manifest ${res.status}` };
    const m = await res.json();
    const icons = [];
    const base = new URL(href, location.href);
    for (const i of m.icons || []) icons.push({ src: i.src, purpose: i.purpose || 'any', ok: (await fetch(new URL(i.src, base))).ok });
    return { m, icons };
  });
  check('manifest parses', !man.error, man.error || '');
  if (!man.error) {
    check('manifest has id, start_url, standalone', !!(man.m.id && man.m.start_url && man.m.display === 'standalone'));
    check('every icon resolves', man.icons.every((i) => i.ok), man.icons.filter((i) => !i.ok).map((i) => i.src).join(' '));
    check('a maskable icon exists', man.icons.some((i) => i.purpose.includes('maskable')));
    check('a 512px icon exists', (man.m.icons || []).some((i) => i.sizes === '512x512'));
  }
  const sw = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    if (!reg) return { error: 'no service worker became ready in 8s' };
    await new Promise((r) => setTimeout(r, 500));
    return { scope: reg.scope, script: reg.active?.scriptURL, caches: await caches.keys() };
  });
  check('service worker activates', !sw.error, sw.error || sw.script);
  if (!sw.error) {
    check('worker registered with a build id', /\?build=(?!__BUILD_ID__)[\w-]+/.test(sw.script || ''), sw.script);
    check('cache name carries the build id', sw.caches.some((c) => c.startsWith('imperator-') && !c.includes('__BUILD_ID__')), sw.caches.join(', '));
  }
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  const offline = (await page.locator('#app').innerText().catch(() => '')).trim();
  check('reloads with the network off', offline.length > 20, `${offline.length} chars`);
  if (offline.length > 20) {
    if (advanceOnce) {
      for (const sel of START) if (await page.locator(sel).count()) { await page.click(sel); break; }
      check('plays a turn offline', await advanceOnce(page));
    } else console.log('--  plays a turn offline: skipped (tools/smoke.mjs exports no advanceOnce)');
  }
  await context.setOffline(false);
  check('site: no errors', !errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
  await close();
}

console.log(ck.failures ? `\n${ck.failures} FAILURE(S)` : '\nbundle check clean');
process.exit(ck.failures ? 1 : 0);
