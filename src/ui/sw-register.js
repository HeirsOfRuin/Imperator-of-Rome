// Page side of sw.js. Call registerSW({ onUpdate }) once after the first render.
//
//  - navigator.serviceWorker THROWS in a sandboxed frame (the getter itself), so
//    a .catch() on register() never sees it (The Company on itch). Guard it.
//  - Registered as sw.js?build=<id> with updateViaCache 'none': every launch
//    asks the network for the worker, and a new build is a new worker.
//  - When a new worker takes over: reload at once if the player has not touched
//    anything yet (a fresh launch), otherwise OFFER the reload through onUpdate.
//    Reloading in the middle of a battle is worse than one launch on old code
//    (Touchline), but a player who never sees the update concludes the fix
//    did not work.
//  - The page tells the worker what it loaded, so the worker caches exactly
//    that for offline play.
//  - Not registered inside a frame (itch.io embeds: not installable, and a
//    worker on itch's shared origin can serve a stale build after the next
//    upload) or from file://.

export const BUILD_ID = '__BUILD_ID__';

export function registerSW(opts = {}) {
  // registerSW(fn) is the older form (game-building's first kit); still accepted.
  const onUpdate = typeof opts === 'function' ? opts : opts.onUpdate;
  let sw;
  try { sw = navigator.serviceWorker; } catch { return; }
  if (!sw || location.protocol === 'file:') return;
  try { if (window.top !== window) return; } catch { return; }

  let touched = false;
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { touched = true; }, { once: true, capture: true });
  const hadController = !!sw.controller;
  let reloaded = false;
  sw.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return; // first install: nothing to replace
    if (!touched) { reloaded = true; location.reload(); return; }
    onUpdate?.(() => { reloaded = true; location.reload(); });
  });

  const go = () => {
    sw.register(`./sw.js?build=${encodeURIComponent(BUILD_ID)}`, { scope: './', updateViaCache: 'none' })
      .then(async (reg) => {
        const ready = await sw.ready;
        const urls = performance.getEntriesByType('resource').map((e) => e.name).concat(location.href.split('#')[0]);
        ready.active?.postMessage({ type: 'cache-these', urls });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => { /* not installable here; the game still runs */ });
  };
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

// Install button. Chrome fires beforeinstallprompt; iOS Safari never does, so
// show "tap Share, then Add to Home Screen" there instead of a dead button.
export function installPrompt(onAvailable) {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    onAvailable?.(() => e.prompt());
  });
  let standalone = false;
  try { standalone = matchMedia('(display-mode: standalone)').matches; } catch { /* old browser */ }
  return { ios: /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone, standalone };
}
