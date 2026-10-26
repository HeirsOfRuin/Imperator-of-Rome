// Write a build id into a built site, in place of __BUILD_ID__, and prove it landed.
//   node tools/stamp.mjs <site-dir> [--id=<id>] [--last=<id>]
//
// The id is the short git hash plus a hash of the site's files, so a rebuild of
// the same commit with a content change still differs, and two deploys of the
// same bytes do not churn players' caches. Fails if a placeholder remains
// anywhere, if no file carried one (nothing was stamped), or if --last equals
// the new id (the deploy would not reach anyone who already has the app).
//
// Why a tool: hand-bumped cache names were forgotten 13 times across four
// repos, and a bundler shipped an escaped "${stamp}" for a month. This file is
// shared by game-scaffold and game-release; keep the copies identical
// (skills/check-skills.mjs enforces it).

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const [dir, ...rest] = process.argv.slice(2);
if (!dir) { console.error('usage: node tools/stamp.mjs <site-dir> [--id=<id>] [--last=<id>]'); process.exit(2); }
const arg = (k) => rest.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.txt']);
const PLACEHOLDER = '__BUILD_ID__';

async function walk(d) {
  const out = [];
  for (const name of await readdir(d)) {
    const p = join(d, name);
    if ((await stat(p)).isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out.sort();
}

const files = await walk(dir);
let id = arg('id');
if (!id) {
  const h = createHash('sha256');
  for (const f of files) h.update(f.slice(dir.length)).update(await readFile(f));
  let git = 'nogit';
  try { git = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a repo */ }
  id = `${git}-${h.digest('hex').slice(0, 8)}`;
}
if (arg('last') && arg('last') === id) { console.error(`!! build id ${id} equals the last deployed id; nothing would update`); process.exit(1); }

let stamped = 0;
for (const f of files) {
  if (!TEXT.has(extname(f))) continue;
  const text = await readFile(f, 'utf8');
  if (!text.includes(PLACEHOLDER)) continue;
  await writeFile(f, text.split(PLACEHOLDER).join(id));
  stamped++;
  console.log(`stamped ${f}`);
}
if (!stamped) { console.error(`!! no file in ${dir} carried ${PLACEHOLDER}; the service worker cache would never change`); process.exit(1); }
for (const f of files) {
  if (TEXT.has(extname(f)) && (await readFile(f, 'utf8')).includes(PLACEHOLDER)) { console.error(`!! placeholder left in ${f}`); process.exit(1); }
}
console.log(`build id ${id} (${stamped} file${stamped === 1 ? '' : 's'})`);
