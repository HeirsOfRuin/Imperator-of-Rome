// Build the installable site for a game served as it is written (shape A, or
// shape B before it has a bundler): copy the files a player's browser needs
// into dist/site/, then stamp the build id. node tools/build-site.mjs
//
// What is copied: every file git tracks (or, outside a git repo, every file),
// minus what a player never loads (EXCLUDE). Tracked-only in a repo, so scratch
// files and local output never ship. Then tools/stamp.mjs writes the build id
// over __BUILD_ID__ in sw.js and the page, and fails if nothing carried it.

import { mkdir, copyFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'dist/site';
const EXCLUDE = [
  /^\.git\//, /^node_modules\//, /^docs\//, /^tests?\//, /^sim\//, /^tools\//, /^prototypes\//, /^content\//,
  /^art\/src\//, /^\.github\//, /^out\//, /^dist\//, /^release\//, /^press\//, /^\.map-cache\//,
  /\.md$/, /^package(-lock)?\.json$/, /^\.gitignore$/,
];

async function walk(d) {
  const out = [];
  for (const n of await readdir(d)) {
    const p = join(d, n);
    if ((await stat(p)).isDirectory()) out.push(...await walk(p)); else out.push(relative('.', p));
  }
  return out;
}

let files;
try {
  files = execFileSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  if (!files.length) throw new Error('nothing tracked');
} catch {
  console.log('not a git repository (or nothing tracked yet): shipping files on disk');
  files = await walk('.');
}
const ship = files.filter((f) => !EXCLUDE.some((re) => re.test(f)));
for (const need of ['index.html', 'sw.js']) {
  if (!ship.includes(need)) throw new Error(`${need} is missing from the site (untracked, or excluded)`);
}

await rm(OUT, { recursive: true, force: true });
for (const f of ship) {
  await mkdir(dirname(join(OUT, f)), { recursive: true });
  await copyFile(f, join(OUT, f));
}
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`${OUT}/: ${ship.length} files`);
execFileSync('node', ['tools/stamp.mjs', OUT], { stdio: 'inherit' });
