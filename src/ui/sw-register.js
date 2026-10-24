// Page side of sw.js. Call registerSW(onUpdate) once after the first render.
//
//  - navigator.serviceWorker THROWS in a sandboxed frame (the getter itself), so
//    a .catch() on register() never sees it (The Company on itch). Guard the lookup.
//  - Ask the worker whether it already found an update: the stylesheet is fetched
//    before any script runs, so the announcement can fire before anyone listens
//    (Touchline: the update bar appeared on some loads and not others).
//  - Report what the page actually loaded so the worker can cache it all.
//  - Skip registration entirely in builds for itch.io: a worker on itch's shared
//    origin can serve a stale build after the next upload, and the embed is not
//    installable anyway (Silk Road strips it; set a build flag).

export function registerSW(onUpdate) {
  let sw;
  try { sw = navigator.serviceWorker; } catch { return; }
  if (!sw || location.protocol === 'file:') return;
  sw.register('./sw.js').then(async () => {
    const reg = await sw.ready;
    const urls = performance.getEntriesByType('resource').map((e) => e.name).concat(location.href);
    reg.active?.postMessage({ type: 'cache-these', urls });
    reg.active?.postMessage({ type: 'update-status' });
  }).catch(() => { /* not installable here; the game still runs */ });
  sw.addEventListener('message', (e) => {
    if (e.data?.type === 'update-ready') onUpdate?.(); // show "New version — reload" (an offer, not a forced reload)
  });
}

// Install button: Chrome fires beforeinstallprompt; iOS Safari never does, so show
// "tap Share, then Add to Home Screen" there instead of a dead button (Silk Road).
export function installPrompt(onAvailable) {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    onAvailable?.(() => { deferred?.prompt(); deferred = null; });
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
  return { ios };
}
