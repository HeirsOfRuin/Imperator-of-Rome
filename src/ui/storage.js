// Browser storage that cannot take the page down.
//
// Reading localStorage THROWS (not returns null) in a cross-site frame with site
// data blocked, in Safari with all cookies blocked, in any sandboxed frame
// without allow-same-origin, and Safari refuses it on file://. The Company's
// itch build was a black rectangle because of one unguarded getItem; The Lists
// and Centennial Farm evaluated the lookup as a default parameter, outside any
// try. Guard the LOOKUP, not just the calls.

function store() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** True when writes persist. The title screen says so when false. */
export const STORAGE_OK = (() => {
  try {
    const s = store();
    if (!s) return false;
    s.setItem('__probe__', '1');
    s.removeItem('__probe__');
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
