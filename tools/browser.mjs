// One way to get a browser, a static server and an error log, for every tool
// that drives the page (smoke, bundle check, icons, press shots, measurement).
//
// Before this, nine repos had ~20 copies of this preamble in four strategies,
// and several only worked on the machine they were written on (a hardcoded
// scratchpad path; file:///home/user/New/index.html). Resolution order:
//   1. PLAYWRIGHT_PATH (a file or package dir), 2. a local `playwright`
//   dependency, 3. the global install Claude cloud sessions ship with,
//   4. `npm root -g`. Fails with one clear message if none work.
//
//   import { launch, serve } from './browser.mjs';
//   const { url, close } = await serve('dist/site');
//   const { browser, page, errors } = await launch({ phone: true });

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

async function loadPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_PATH) tries.push(process.env.PLAYWRIGHT_PATH);
  try { tries.push(createRequire(import.meta.url).resolve('playwright')); } catch { /* not a dependency */ }
  try { tries.push(createRequire(join(process.cwd(), 'package.json')).resolve('playwright')); } catch { /* not local */ }
  tries.push('/opt/node22/lib/node_modules/playwright/index.js');
  try { tries.push(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright', 'index.js')); } catch { /* no npm */ }
  for (const p of tries) {
    try {
      let target = p;
      if ((await stat(p)).isDirectory()) target = join(p, 'index.js');
      const mod = await import(target);
      const chromium = mod.chromium || mod.default?.chromium;
      if (chromium) return chromium;
    } catch { /* try the next */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_PATH, or `npm i -D playwright` (cloud sessions have it preinstalled).');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.wav': 'audio/wav',
};

/** Serve a directory over http on a free port. */
export async function serve(dir = '.') {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      let path = join(root, rel);
      if (rel.endsWith('/') || rel === '') path = join(path, 'index.html');
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${server.address().port}/`;
  return { url, server, close: () => new Promise((r) => server.close(r)) };
}

/** A browser and one page; `errors` collects console errors and page errors. */
export async function launch({ phone = true, width = 390, height = 844 } = {}) {
  const chromium = await loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext(phone
    ? { viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { browser, context, page, errors, chromium };
}

/** Report helper: prints ok/!! lines and counts failures. */
export function checker() {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : '!!  '}${label}${detail ? `  ${detail}` : ''}`);
    if (!ok) failures++;
    return ok;
  };
  return { check, get failures() { return failures; } };
}

/** Horizontal overflow in px; anything over 1 is a phone layout bug. */
export function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
