// The desktop download: the whole game in one HTML file that opens from a
// downloads folder and plays with no network. node tools/bundle-single.mjs
//
// Reads the stamped site (dist/site, from tools/build-site.mjs), so the file is
// exactly the build that went to Pages and to the itch zip, build id included.
// Writes dist/imperator.html; tools/build-itch.mjs --single=dist/imperator.html
// then packs it for the itch downloads list.
//
// The modules stay real ES modules. Each one goes into the page as a data: URL
// and an import map tells the browser which data: URL each import means, so the
// browser links them exactly as it does on the web. A bundler that turns
// modules into functions (Centennial Farm's tools/bundle.js) cannot carry this
// engine: it has 28 import cycles, which ES modules resolve by live binding and
// that transform resolves by running out of memory. Only the import paths are
// rewritten; it fails loudly on any import form it does not recognise.
//
// What changes from the site: the stylesheet, the five typefaces, the icons and
// the manifest go inside the file as data. The service worker is left out: it
// cannot run from file://, and sw-register.js already returns there.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, join } from 'node:path';

const SITE = 'dist/site';
const ENTRY = 'src/ui/app.js';
const OUT = 'dist/imperator.html';
const ROOT = resolve(SITE);

const modules = new Map(); // site-relative path -> rewritten source
const KEY = (rel) => `@imperator/${rel}`;

async function load(rel) {
  if (modules.has(rel)) return;
  modules.set(rel, null); // claimed before its imports load: the graph has cycles
  const abs = join(ROOT, rel);
  let code = await readFile(abs, 'utf8').catch(() => { throw new Error(`cannot read module ${rel}`); });
  const deps = [];
  code = code.replace(/^(import\s[^;]*?\sfrom\s+|export\s[^;]*?\sfrom\s+)(['"])([^'"]+)\2/gms, (whole, head, q, spec) => {
    if (!spec.startsWith('.')) throw new Error(`${rel}: bare import "${spec}" cannot be bundled`);
    const dep = relative(ROOT, resolve(dirname(abs), spec)).split('\\').join('/');
    deps.push(dep);
    return `${head}${q}${KEY(dep)}${q}`;
  });
  const leftover = code.match(/^\s*import\s*['"]/m) || code.match(/\bimport\s*\(/) || code.match(/\bimport\.meta\b/);
  if (leftover) throw new Error(`${rel}: unsupported import form -> ${leftover[0].trim()}`);
  modules.set(rel, code);
  for (const d of deps) await load(d);
}

const dataUri = async (rel, type) => `data:${type};base64,${(await readFile(join(ROOT, rel))).toString('base64')}`;

await load(ENTRY);
const imports = {};
for (const [rel, code] of modules) imports[KEY(rel)] = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
// JSON inside a <script> tag: escape "</" so module text can never close the tag early.
const importMap = JSON.stringify({ imports }).replace(/<\//g, '<\\/');
const script = `<script type="importmap">${importMap}</script>\n<script type="module">import ${JSON.stringify(KEY(ENTRY))};</script>`;

// The stylesheet, with each typeface inlined where its url() was.
let css = await readFile(join(ROOT, 'src/ui/style.css'), 'utf8');
const fonts = [...css.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)/g)];
if (!fonts.length) throw new Error('no typefaces found in style.css');
for (const [whole, url] of fonts) {
  const rel = relative(ROOT, resolve(join(ROOT, 'src/ui'), url)).split('\\').join('/');
  const uri = await dataUri(rel, 'font/woff2');
  css = css.replace(whole, () => `url('${uri}')`);
}

const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.webmanifest'), 'utf8'));
manifest.icons = [{ src: await dataUri('icons/icon-512.png', 'image/png'), sizes: '512x512', type: 'image/png' }];
const manifestUri = `data:application/manifest+json;base64,${Buffer.from(JSON.stringify(manifest)).toString('base64')}`;

let html = await readFile(join(ROOT, 'index.html'), 'utf8');
const swaps = [
  ['manifest', /<link rel="manifest" href="manifest\.webmanifest">/, () => `<link rel="manifest" href="${manifestUri}">`],
  ['icon', /href="icons\/icon\.svg"/, async () => `href="${await dataUri('icons/icon.svg', 'image/svg+xml')}"`],
  ['touch icon', /href="icons\/icon-192\.png"/, async () => `href="${await dataUri('icons/icon-192.png', 'image/png')}"`],
  ['font preloads', /<link rel="preload" href="fonts\/[^"]+" as="font"[^>]*>\n?/g, () => ''],
  ['stylesheet', /<link rel="stylesheet" href="src\/ui\/style\.css">/, () => `<style>\n${css}\n</style>`],
  ['script', /<script type="module" src="src\/ui\/app\.js"><\/script>/, () => script],
];
// Assert every swap matched: a replace that matches nothing still "succeeds".
for (const [what, re, fn] of swaps) {
  if (!re.test(html)) throw new Error(`the ${what} tag was not found in ${SITE}/index.html`);
  re.lastIndex = 0;
  const value = await fn();
  html = html.replace(re, () => value);
}
const stray = html.match(/(?:src|href)="(?!data:|https?:|#)[^"]+"/);
if (stray) throw new Error(`a reference to a file beside the page is left: ${stray[0]}`);
if (html.includes('__BUILD_ID__')) throw new Error(`${SITE} is not stamped: run tools/build-site.mjs first`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, html, 'utf8');
console.log(`${OUT}: ${modules.size} modules, ${(html.length / 1024).toFixed(0)} KB, needs nothing beside it`);
