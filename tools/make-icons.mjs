// Generates the app icons: an eagle standard in gold on imperial purple.
// The SVG is the source; PNGs are rendered from it with the preinstalled
// Playwright. Run: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.js';
const pw = await import(PW);
const chromium = pw.chromium || pw.default?.chromium;

// 16x16 pixel eagle standard, one character per pixel: G gold, g pale gold, S scarlet
const ART = [
  '................',
  '.......gg.......',
  '..GG..gGGg..GG..',
  '.GGGG.GGGG.GGGG.',
  '..GGGGGGGGGGGG..',
  '....GGGGGGGG....',
  '......GGGG......',
  '.......GG.......',
  '....SSSSSSSS....',
  '....SgSSSSgS....',
  '....SSSSSSSS....',
  '.......GG.......',
  '.......GG.......',
  '.......GG.......',
  '......GGGG......',
  '................',
];
const COL = { G: '#C9A227', g: '#E8D48A', S: '#C8102E' };
let rects = '';
ART.forEach((row, y) => [...row].forEach((c, x) => { if (COL[c]) rects += `<rect x="${x + 2}" y="${y + 2}" width="1" height="1" fill="${COL[c]}"/>`; }));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" shape-rendering="crispEdges"><rect width="20" height="20" fill="#4E1A45"/>${rects}</svg>`;
mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
writeFileSync(new URL('../icons/icon.svg', import.meta.url), svg);
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../icons/icon-${size}.png`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
console.log('icons written');
