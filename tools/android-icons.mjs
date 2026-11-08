// Draw the Android app's launcher icons and splash screens from the game's own
// icons, so the app does not ship with Capacitor's placeholder logo.
// node tools/android-icons.mjs   (after `npx cap add android`; re-run if the icons change)
//
// Every PNG Capacitor generated under android/app/src/main/res is redrawn at its
// own size, with nearest-neighbour scaling so the pixel eagle stays sharp:
//   ic_launcher, ic_launcher_round   icons/icon-512.png (the round one clipped to a circle)
//   ic_launcher_foreground           icons/maskable-512.png (the eagle already sits in the
//                                    safe zone a launcher's mask keeps)
//   splash                           the eagle at a third of the short side on the purple
// The adaptive icon's background colour is read from the maskable icon's corner.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch } from './browser.mjs';

const RES = 'android/app/src/main/res';

function pngSize(buf) { return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; }

const targets = [];
for (const dir of await readdir(RES)) {
  if (!/^(mipmap|drawable)/.test(dir)) continue;
  for (const f of await readdir(join(RES, dir))) {
    if (!f.endsWith('.png')) continue;
    const kind = f.replace(/\.png$/, '');
    if (!['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'splash'].includes(kind)) {
      throw new Error(`unexpected image ${dir}/${f}: decide how to draw it`);
    }
    const [w, h] = pngSize(await readFile(join(RES, dir, f)));
    targets.push({ path: join(RES, dir, f), kind, w, h });
  }
}
if (!targets.length) throw new Error(`no images under ${RES}: run npx cap add android first`);

const icon = `data:image/png;base64,${(await readFile('icons/icon-512.png')).toString('base64')}`;
const mask = `data:image/png;base64,${(await readFile('icons/maskable-512.png')).toString('base64')}`;

const { browser, page } = await launch({ phone: false, width: 800, height: 600 });
await page.setContent('<canvas id="c"></canvas>');
const bg = await page.evaluate(async (src) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.getElementById('c'); c.width = 1; c.height = 1;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return '#' + [r, gr, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}, mask);

for (const t of targets) {
  const b64 = await page.evaluate(async ({ t, icon, mask, bg }) => {
    const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
    const c = document.getElementById('c'); c.width = t.w; c.height = t.h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, t.w, t.h);
    if (t.kind === 'ic_launcher') g.drawImage(await load(icon), 0, 0, t.w, t.h);
    if (t.kind === 'ic_launcher_round') {
      g.beginPath(); g.arc(t.w / 2, t.h / 2, t.w / 2, 0, Math.PI * 2); g.clip();
      g.drawImage(await load(icon), 0, 0, t.w, t.h);
    }
    if (t.kind === 'ic_launcher_foreground') g.drawImage(await load(mask), 0, 0, t.w, t.h);
    if (t.kind === 'splash') {
      g.fillStyle = bg; g.fillRect(0, 0, t.w, t.h);
      // the maskable icon is the eagle on the same purple; scale it in whole steps of its 512 px
      const side = Math.max(0.25, Math.round(Math.min(t.w, t.h) * 0.6 / 512 * 4) / 4) * 512;
      const s = Math.min(side, Math.min(t.w, t.h));
      g.drawImage(await load(mask), Math.round((t.w - s) / 2), Math.round((t.h - s) / 2), s, s);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { t, icon, mask, bg });
  await writeFile(t.path, Buffer.from(b64, 'base64'));
}
await browser.close();

const colour = join(RES, 'values/ic_launcher_background.xml');
const xml = await readFile(colour, 'utf8');
const next = xml.replace(/<color name="ic_launcher_background">[^<]*<\/color>/, `<color name="ic_launcher_background">${bg}</color>`);
if (next === xml && !xml.includes(bg)) throw new Error(`could not set the icon background in ${colour}`);
await writeFile(colour, next);
console.log(`${targets.length} images redrawn; adaptive icon background ${bg}`);
