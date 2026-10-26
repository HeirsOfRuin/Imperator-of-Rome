// Package a built game for itch.io. Copy to tools/build-itch.mjs.
//
//   node tools/build-itch.mjs --site=dist/site --slug=the-company --name="The Company" \
//     [--single=dist/the-company.html] [--keep-sw]
//
// Writes release/:
//   <slug>-web.zip       the site with index.html at the ZIP ROOT (itch will not run
//                        a zip whose game sits in a folder). Upload as "played in the browser".
//   <slug>.html          the single file, if --single: a download that opens in any
//                        browser and plays offline (not Safari: it refuses storage on file://).
//   <slug>-offline.zip   the single file and a README, for the downloads list.
//
// The service worker is LEFT OUT of the web zip unless --keep-sw: the embed is
// never installable (browsers only install top-level pages), and a worker on
// itch's shared origin can keep serving the old build after the next upload
// (Silk Road). The kit's sw-register.js already skips frames; dropping sw.js
// makes that true for any older registration code too (it 404s quietly).
// The zip is read back and verified before the script reports success.

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { zip, readZipNames } from './zip.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return [m[1], m[2] ?? true]; }));
const site = String(args.site || 'dist/site');
const slug = String(args.slug || '');
const name = String(args.name || slug);
if (!slug) { console.error('usage: node tools/build-itch.mjs --site=dist/site --slug=<slug> --name="<Name>" [--single=dist/<slug>.html] [--keep-sw]'); process.exit(2); }

async function walk(d) {
  const out = [];
  for (const n of await readdir(d)) {
    const p = join(d, n);
    if ((await stat(p)).isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

const files = [];
for (const f of (await walk(site)).sort()) {
  const rel = relative(site, f).split('\\').join('/');
  if (rel === '.nojekyll' || rel.endsWith('.map')) continue;
  if (!args['keep-sw'] && rel === 'sw.js') continue;
  files.push({ name: rel, data: await readFile(f) });
}
const index = files.find((f) => f.name === 'index.html');
if (!index) throw new Error(`${site}/index.html not found: build the site first`);
if (index.data.toString('utf8').includes('__BUILD_ID__')) throw new Error(`${site}/index.html still has __BUILD_ID__: the build was not stamped`);

await mkdir('release', { recursive: true });
const web = zip(files);
const names = readZipNames(web);
if (!names.includes('index.html')) throw new Error('verification failed: index.html is not at the zip root');
await writeFile(`release/${slug}-web.zip`, web);
console.log(`release/${slug}-web.zip       ${(web.length / 1024).toFixed(0)} KB, ${names.length} files, index.html at the root${args['keep-sw'] ? '' : ', no service worker'}`);

if (args.single) {
  const html = await readFile(String(args.single));
  await writeFile(`release/${slug}.html`, html);
  const readme = `${name.toUpperCase()}

To play: open "${name}.html" in any web browser (Chrome, Firefox, Edge; on a Mac
or an iPhone use the itch.io page instead, because Safari will not save from a
file). No install, no account. The game is this one file.

It saves itself in that browser. Saves made on the itch.io page, in the
installed app or in another browser are kept separately; the menu's save code
moves a game between them.
`;
  const off = zip([{ name: `${name}/${name}.html`, data: html }, { name: `${name}/README.txt`, data: Buffer.from(readme.replace(/\n/g, '\r\n')) }]);
  await writeFile(`release/${slug}-offline.zip`, off);
  console.log(`release/${slug}.html          ${(html.length / 1024).toFixed(0)} KB, one file`);
  console.log(`release/${slug}-offline.zip   ${(off.length / 1024).toFixed(0)} KB, the file and a README`);
}
console.log('Next: node tools/pre-public.mjs (plays the zip the way itch embeds it), then the kit.');
