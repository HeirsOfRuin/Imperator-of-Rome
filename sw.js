// Service worker for Imperator. Offline play for an installed, backend-free game.
//
// One design for every shape (decided 2026-10-26 from nine builds):
//  - The cache is named by the BUILD ID, which the build writes in place of the
//    placeholder below (tools/bundle.js, the Vite build, or tools/stamp.mjs).
//    A new build is a new worker with a new cache; activate deletes the old.
//    Hand-bumped names were forgotten 13 times across four repos, and
//    Centennial Farm shipped an escaped placeholder for a month, so the build
//    asserts the placeholder is gone.
//  - The page registers sw.js?build=<id> with updateViaCache 'none', so the
//    browser checks for a new worker on every launch (Knight of Adalia).
//  - Navigations: network first with a short timeout, so a new build arrives
//    whenever there is signal, and the cached page when there is none.
//    Everything else: cache first within this build's cache.
//  - The page reports what it actually loaded and the worker caches that, so
//    no precache list goes stale (Touchline: 55 files cached against 7).
//  - addAll rejects on one 404 and leaves the worker uninstalled with nothing
//    on screen, so shell files are added one by one.

const BUILD = '__BUILD_ID__';
const CACHE = `imperator-${BUILD}`;
const SHELL = ['./', './index.html', './manifest.webmanifest'];
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('imperator-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'cache-these' && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheAll(event.data.urls));
  }
});

async function cacheAll(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(urls.map(async (url) => {
    try {
      if (new URL(url, self.location.href).origin !== self.location.origin) return;
      if (await cache.match(url, { ignoreSearch: true })) return;
      const res = await fetch(url, { cache: 'reload' });
      if (res.ok) await cache.put(url, res.clone());
    } catch { /* one file failing is no reason to abandon the rest */ }
  }));
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-store' }), timeout(NAV_TIMEOUT_MS)]);
        if (res.ok) cache.put('./index.html', res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});
