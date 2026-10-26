// Does a new build reach someone who already has the app? Copy to tools/.
//   node tools/update-check.mjs [--site=dist/site]
//
// Installs the current site in a browser (service worker active, offline
// cache filled), then deploys a "next build" over it: a copy of the site with
// a different build id. A fresh launch must end on the new build: the new
// worker controls the page, the old cache is gone, and the page's build id is
// the new one. Touchline's refresh silently did nothing on most visits (a 304
// with res.ok false), and players kept an old build indefinitely; this is the
// check that would have caught it. "This is exactly the kind of claim that
// rots silently."

import { cp, rm, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, serve, checker } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return [m[1], m[2] ?? true]; }));
const site = String(args.site || 'dist/site');
const ck = checker();
const { check } = ck;

// The kit's sw-register reloads a freshly launched page once when a new worker
// takes over: that is the design. Evaluate through it instead of failing on it.
async function settle(page, fn, arg) {
  for (let i = 0; i < 5; i++) {
    try { return await page.evaluate(fn, arg); } catch (e) {
      if (!/context was destroyed|navigation/i.test(e.message)) throw e;
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  throw new Error('the page kept navigating');
}

async function walk(d) {
  const out = [];
  for (const n of await readdir(d)) { const p = join(d, n); if ((await stat(p)).isDirectory()) out.push(...await walk(p)); else out.push(p); }
  return out;
}
const sw = await readFile(join(site, 'sw.js'), 'utf8');
const oldId = /const BUILD = '([^']+)'/.exec(sw)?.[1];
if (!oldId || oldId === '__BUILD_ID__') { console.error(`!! ${site}/sw.js has no stamped build id (const BUILD = '...'): build and stamp first`); process.exit(1); }
const newId = `${oldId}-next`;

const dir = join(tmpdir(), `update-check-${process.pid}`);
await rm(dir, { recursive: true, force: true });
await cp(site, dir, { recursive: true });
const { url, close } = await serve(dir);
const { browser, context, page, errors } = await launch({ phone: true });

await page.goto(url, { waitUntil: 'load' });
const first = await settle(page, async () => {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
  await new Promise((r) => setTimeout(r, 800));
  return reg ? { script: reg.active?.scriptURL, caches: await caches.keys() } : null;
});
check('first visit: worker active', !!first, first?.script);
check(`first visit: cache for ${oldId}`, !!first?.caches.some((c) => c.endsWith(oldId)), first?.caches.join(', '));

// deploy the next build: the same files with a new build id
for (const f of await walk(dir)) {
  if (!/\.(html|js|mjs|css|json|webmanifest)$/.test(f)) continue;
  const t = await readFile(f, 'utf8');
  if (t.includes(oldId)) await writeFile(f, t.split(oldId).join(newId));
}

// a fresh launch: a new tab with no interaction, as when the app is opened from the home screen
const p2 = await context.newPage();
await page.close();
await p2.goto(url, { waitUntil: 'load' });
await p2.waitForTimeout(2500);
await p2.reload({ waitUntil: 'load' }).catch(() => {});
await p2.waitForTimeout(800);
const after = await settle(p2, async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { script: reg?.active?.scriptURL, caches: await caches.keys(), html: document.documentElement.outerHTML.length };
});
check('next build: the new worker is active', (after.script || '').includes(newId), after.script);
check('next build: the old cache is gone', !after.caches.some((c) => c.endsWith(oldId)), after.caches.join(', '));
check('next build: a cache for the new id exists', after.caches.some((c) => c.endsWith(newId)), after.caches.join(', '));
const served = await settle(p2, () => fetch('./sw.js').then((r) => r.text())).catch(() => '');
check('next build: the worker file served is the new one', served.includes(newId));
check('no errors', !errors.length, errors.slice(0, 3).join(' | '));

await browser.close();
await close();
await rm(dir, { recursive: true, force: true });
console.log(ck.failures ? `\n${ck.failures} FAILURE(S): returning players would not get the new build` : '\nupdate check clean: a new deploy reaches returning players');
process.exit(ck.failures ? 1 : 0);
