// Storage that cannot take the page down. Copy into src/ui/storage.js (or inline
// into a single-file game).
//
// Reading localStorage THROWS (not returns null) in a cross-site frame with site
// data blocked, in Safari with all cookies blocked, in any sandboxed frame without
// allow-same-origin, and Safari refuses it on file:// URLs. The Company's itch
// build was a black rectangle because of ONE unguarded getItem on the title screen.
// The Lists threw on boot because `globalThis.localStorage` was evaluated as a
// default parameter, before any try block. Guard the LOOKUP, not just the calls.

function store() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** True when writes persist. Show a line on the title screen when false. */
export const STORAGE_OK = (() => {
  try {
    const s = store();
    if (!s) return false;
    const k = '__probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return true;
  } catch { return false; }
})();

export function lsGet(key) {
  try { return store()?.getItem(key) ?? null; } catch { return null; }
}

export function lsSet(key, value) {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch { return false; }
}

export function lsDel(key) {
  try { store()?.removeItem(key); } catch { /* nothing to do */ }
}

// The save KEY is a contract: renaming it orphans every save on every device
// (Silk Road kept 'samarkand-ledger' keys after the retitle on purpose). Put a
// version in the key AND in the payload, and migrate forward:
//
//   const SAVE_KEY = 'mygame.save.v1';           // never rename
//   const SAVE_VERSION = 3;
//   const MIGRATIONS = { 1: (s) => ({ ...s, v: 2, slots: [] }), 2: (s) => ({ ...s, v: 3, ... }) };
//   export function migrate(s) { while (s.v < SAVE_VERSION) s = MIGRATIONS[s.v](s); return s; }
//
// Keep a fixture of each old version in test/fixtures/ (The Lists has v1..v6) and
// a test that loads every one and plays on. Saves must also export as text or a
// file: browser storage is per-origin, per-browser, per-device, and itch's copy
// and the Pages copy do not share it.
