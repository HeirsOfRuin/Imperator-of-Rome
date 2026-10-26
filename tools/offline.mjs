// Offline check: load the game, let the service worker cache it, cut the
// network, reload. Fails if anything is fetched from another origin or the
// bundled fonts are not used offline. node tools/offline.mjs
// Load the game, let the worker cache it, go offline, reload: fonts must be the bundled ones.
const pw = await import('/opt/node22/lib/node_modules/playwright/index.js');
const chromium = pw.chromium || pw.default.chromium;
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const ROOT = process.env.ROOT || process.cwd();
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const external = [];
const srv = createServer(async (q, r) => { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); let d; try { d = await readFile(p); } catch { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('request', (rq) => { if (!rq.url().startsWith(`http://localhost:${port}`)) external.push(rq.url()); });
await page.goto(`http://localhost:${port}/index.html`);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) if (r.url.endsWith('.woff2')) out.push(r.url.split('/').pop()); } return out; });
await ctx.setOffline(true);
srv.close();
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
const fonts = await page.evaluate(async () => { await document.fonts.ready; return { title: document.fonts.check("700 20px Cinzel"), body: document.fonts.check("400 15px 'Source Sans 3'"), loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight) }; });
await page.screenshot({ path: (process.env.SHOTS || '/tmp/shots') + '/offline-title.png' });
console.log({ external, cached, offlineFonts: fonts });
await b.close();
const ok = !external.length && fonts.title && fonts.body;
console.log(ok ? 'offline clean' : 'OFFLINE FAILURE');
process.exit(ok ? 0 : 1);
