// Run the "before going public" checks instead of reading them. Copy to tools/.
//
//   node tools/pre-public.mjs --zip=release/<slug>-web.zip [--page=docs/itch/description.html] [--site=dist/site]
//
// 1. Unpacks the web zip and plays it the way itch embeds it, in a cross-origin
//    iframe, with storage BLOCKED: localStorage, sessionStorage, indexedDB and
//    navigator.serviceWorker throw SecurityError inside the frame, as they do
//    when a browser blocks third-party site data (Safari, Brave, incognito).
//    The game must render, start, and raise no uncaught error (The Company was
//    a black rectangle in exactly this frame). The block is injected rather
//    than made with an opaque-origin sandbox: that also blocks module scripts
//    over CORS, which itch does not, and fails every ES-module game falsely.
// 2. The same zip in the same frame with storage allowed: it must start clean.
// 3. The page copy: a privacy line, an AI-use statement, no unfilled
//    placeholders (in description.html and ITCH.md), and every number in the
//    copy listed so each can be confirmed against the build (The Company's
//    tutorial and help taught an 11,000-florin win condition when it was 52,000).
// 4. The site: fonts from the network are flagged (offline typography, and the
//    privacy line must name them).
// Exits 1 on any failure; warnings are listed for a person to judge.

import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { inflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, serve, checker } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return [m[1], m[2] ?? true]; }));
const ck = checker();
const { check } = ck;
const warn = (m) => console.log(`--  ${m}`);

// ---- unpack the zip (central directory -> local headers -> inflate)
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + n).toString('utf8');
    const ln = buf.readUInt16LE(off + 26), lx = buf.readUInt16LE(off + 28);
    const raw = buf.subarray(off + 30 + ln + lx, off + 30 + ln + lx + csize);
    out.push({ name, data: method === 8 ? inflateRawSync(raw) : raw });
    p += 46 + n + x + c;
  }
  return out;
}

if (args.zip) {
  const files = unzip(await readFile(String(args.zip)));
  check('zip: index.html at the root', files.some((f) => f.name === 'index.html'), files.slice(0, 6).map((f) => f.name).join(' '));
  const dir = join(tmpdir(), `prepublic-${process.pid}`);
  await rm(dir, { recursive: true, force: true });
  for (const f of files) { await mkdir(dirname(join(dir, f.name)), { recursive: true }); await writeFile(join(dir, f.name), f.data); }
  const game = await serve(dir); // http://localhost:<port>/
  const frameUrl = game.url;
  const host = createServer((req, res) => {
    const sandbox = 'allow-scripts allow-forms allow-popups allow-same-origin allow-modals';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><body style="margin:0;background:#222"><iframe id="g" src="${frameUrl}" sandbox="${sandbox}" style="width:480px;height:820px;border:0"></iframe></body>`);
  });
  await new Promise((r) => host.listen(0, '127.0.0.1', r)); // 127.0.0.1 vs localhost: a different origin
  const hostUrl = `http://127.0.0.1:${host.address().port}/`;

  for (const mode of ['strict', 'normal']) {
    const { browser, context, page, errors } = await launch({ phone: false });
    if (mode === 'strict') {
      await context.addInitScript(() => {
        if (window === window.top) return; // only inside the game's frame
        const deny = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };
        for (const k of ['localStorage', 'sessionStorage', 'indexedDB']) {
          try { Object.defineProperty(window, k, { get: deny, configurable: true }); } catch { /* keep going */ }
        }
        try { Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: deny, configurable: true }); } catch { /* keep going */ }
      });
    }
    await page.goto(`${hostUrl}?${mode}`, { waitUntil: 'load' });
    const frame = page.frames().find((f) => f.url().startsWith(frameUrl));
    await page.waitForTimeout(800);
    const text = frame ? (await frame.locator('body').innerText().catch(() => '')).trim() : '';
    const label = mode === 'strict' ? 'sandboxed, storage blocked' : 'cross-origin frame';
    check(`${label}: the game renders`, text.length > 20, `${text.length} chars`);
    const start = frame && (await frame.locator('[data-act="new"], button').first().count());
    if (start) {
      await frame.locator('[data-act="new"], button').first().click().catch(() => {});
      await page.waitForTimeout(300);
      const after = (await frame.locator('body').innerText().catch(() => '')).trim();
      check(`${label}: a game starts`, after.length > 20 && after !== text, `${after.length} chars`);
    }
    const errs = errors.filter((e) => !/favicon|404/.test(e));
    check(`${label}: no uncaught errors`, !errs.length, errs.slice(0, 3).join(' | '));
    if (mode === 'strict') {
      const said = /stor|kept|save/i.test(text);
      if (!said) warn('sandboxed with storage blocked, the title screen does not say saves will not be kept');
    }
    await browser.close();
  }
  host.close();
  await game.close();
  await rm(dir, { recursive: true, force: true });
}

// ---- the page copy
const copyPath = String(args.page || 'docs/itch/description.html');
const copy = await readFile(copyPath, 'utf8').catch(() => null);
if (!copy) warn(`no page copy at ${copyPath} (templates/description.html is the skeleton)`);
else {
  const plain = copy.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  check('copy: a privacy line (account, ads, tracking)', /no account|no ads|no analytics|no tracking/i.test(plain));
  check('copy: says how AI was used', /\bAI\b|artificial intelligence|generated/i.test(plain));
  const holes = copy.match(/\{\{[^}]*\}\}|&lt;[A-Z][^&]{0,80}&gt;|<[A-Z][a-z][^<>]{0,80}>|\bTODO\b|\bTBD\b|lorem/g) || [];
  check('copy: no unfilled placeholders', !holes.length, holes.slice(0, 3).join(' | '));
  const kit = await readFile(join(dirname(copyPath), 'ITCH.md'), 'utf8').catch(() => '');
  const kitHoles = kit.split('\n').filter((l) => !l.trim().startsWith('<!--') && /<[a-z][^<>=]{3,100}>/.test(l)).map((l) => l.trim());
  if (kit) check('ITCH.md: no unfilled <...> fields', !kitHoles.length, kitHoles.slice(0, 3).join(' | '));
  const numbers = [...new Set(plain.match(/[^.!?]*\b\d[\d,.]*\b[^.!?]*[.!?]/g) || [])].map((s) => s.trim()).filter((s) => s.length < 220);
  if (numbers.length) {
    console.log(`--  ${numbers.length} sentence(s) in the copy carry numbers; confirm each against the build:`);
    for (const s of numbers.slice(0, 25)) console.log(`      · ${s}`);
  }
}

// ---- the site
const site = String(args.site || 'dist/site');
const html = await readFile(join(site, 'index.html'), 'utf8').catch(() => '');
if (html && /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) {
  warn('fonts load from Google: offline the game loses its typography, and the privacy line must say the page fetches its fonts');
  if (copy && !/font/i.test(copy)) check('copy: names the font request (the only thing that leaves the page)', false);
}

console.log(ck.failures ? `\n${ck.failures} FAILURE(S): not ready to publish` : '\npre-public checks clean. Now play the uploaded draft yourself, on a phone, before setting it Public.');
process.exit(ck.failures ? 1 : 0);
