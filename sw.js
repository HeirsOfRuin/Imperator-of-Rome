// Service worker for a static, backend-free game. Copy to the site root as sw.js
// and pair it with sw-register.js. Source: Touchline (Football/sw.js), trimmed.
//
// Decisions, each from a measured failure:
//  - Cache-first: the cached copy IS the app, not a stale view of something live.
//  - No hand-maintained precache list. A list of module paths goes stale the first
//    time a file is added. The page reports what it actually loaded (Performance
//    API) and the worker caches that: 55 files cached against 7 without it,
//    because the worker does not control the page during the first module import.
//  - Background refresh fetches with cache:'reload'. Passing the page's own
//    Request through carries If-Modified-Since, the server answers 304, res.ok is
//    false, and the refresh silently does nothing (returning players stuck on an
//    old build indefinitely).
//  - Byte comparison tells the page a new build arrived; the page OFFERS a reload
//    (reloading in the 78th minute of a match is worse than a stale build).
//  - Each SHELL file is added on its own: addAll rejects the batch on one 404 and
//    leaves the worker uninstalled with nothing on screen saying so.
//
// BUMP CACHE ON EVERY RELEASE (or stamp it with the build hash, as Farmyard's
// bundler does) so returning players get the new build.

const CACHE = 'imperator-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const n of await caches.keys()) if (n !== CACHE) await caches.delete(n);
    await self.clients.claim();
  })());
});

let announced = false;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'update-status') {
    if (announced) event.source?.postMessage({ type: 'update-ready' });
  } else if (event.data?.type === 'cache-these' && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheAll(event.data.urls));
  }
});

async function cacheAll(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(urls.map(async (url) => {
    try {
      if (new URL(url, self.location.href).origin !== self.location.origin) return;
      if (await cache.match(url)) return;
      const res = await fetch(url, { cache: 'reload' });
      if (res && res.ok) await cache.put(url, res.clone());
    } catch { /* one file failing is no reason to abandon the rest */ }
  }));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) { event.waitUntil(update(req)); return cached; }
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

async function update(req) {
  try {
    const res = await fetch(req.url, { cache: 'reload', credentials: 'same-origin' });
    if (!res || !res.ok || res.type !== 'basic') return;
    const cache = await caches.open(CACHE);
    const old = await cache.match(req, { ignoreSearch: true });
    const changed = old ? (await old.clone().text()) !== (await res.clone().text()) : false;
    await cache.put(req, res.clone());
    if (changed && !announced) {
      announced = true;
      for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'update-ready' });
    }
  } catch { /* offline: the cached copy stands */ }
}
