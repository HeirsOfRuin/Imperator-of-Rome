// Turn a measurement's JSON into the Markdown that goes into the docs, so
// numbers are never transcribed by hand (Imperator spent 4 of 14 commits on
// transcription, and the SE was dropped on the way).
//
//   node sim/report.mjs out/depth.json [--title="Depth ablation"] [--metrics=win]
//
// Prints two blocks: a table for DESIGN.md's "as built" section, with run
// counts and ±1 SE, and a one-row decisions-log entry with the date, the git
// hash and the command that produced it, so the next session can re-run it.

import { readFileSync } from 'node:fs';
import { parseArgs, fmt, fmtGap } from './measure-lib.js';

const args = parseArgs();
const file = args._[0];
if (!file) { console.error('usage: node sim/report.mjs <result.json> [--title=...] [--metrics=a,b]'); process.exit(2); }
const r = JSON.parse(readFileSync(file, 'utf8'));
const only = args.metrics ? String(args.metrics).split(',') : null;
const pick = (m) => Object.keys(m).filter((k) => !only || only.includes(k));
const cmd = `\`node sim/${r.tool === 'verify-claims' ? 'verify-claims' : r.tool}.js ${(r.argv || []).join(' ')}\``;
const title = args.title || r.config || r.tool;
const lines = [];
const row = (cells) => `| ${cells.join(' | ')} |`;

if (r.tool === 'run') {
  const names = pick(r.cells[0].metrics);
  lines.push(row(['Cell', 'n', ...names]), row(['---', '---:', ...names.map(() => '---:')]));
  for (const c of r.cells) lines.push(row([c.label, c.n, ...names.map((n) => fmt(c.metrics[n]))]));
} else if (r.tool === 'ablate') {
  const vnames = Object.keys(r.cells[0].variants);
  const names = pick(r.cells[0].base);
  const meanOf = (m) => (Number.isFinite(m?.mean) ? (Math.abs(m.mean) >= 100 ? Math.round(m.mean) : m.mean.toFixed(2)) : '—');
  const all = r.pooled ? [...r.cells, { ...r.pooled, label: '**All**' }] : r.cells;
  for (const metric of names) {
    const isRate = r.cells[0].base[metric].type === 'rate';
    lines.push(isRate ? `**${metric}** (gap from base in points; ~ within noise)` : `**${metric}** (median, mean in brackets)`, '');
    lines.push(row(['Cell', 'n', 'Base', ...vnames]), row(['---', '---:', '---:', ...vnames.map(() => '---:')]));
    for (const c of all) {
      const baseCell = isRate ? fmt(c.base[metric]) : `${fmt(c.base[metric]).split(' ')[0]} (${meanOf(c.base[metric])})`;
      lines.push(row([c.label, c.n, baseCell, ...vnames.map((v) => {
        const x = c.variants[v];
        const g = isRate ? (x.gaps?.[metric] ? fmtGap(x.gaps[metric]) : '—') : `${fmt(x.metrics[metric]).split(' ')[0]} (${meanOf(x.metrics[metric])})`;
        return !isRate || x.changed === null || x.changed === undefined ? g : `${g} (${x.changed}/${x.n} changed${x.changed ? '' : ', **inert**'})`;
      })]));
    }
    lines.push('');
  }
} else if (r.tool === 'curve') {
  lines.push(row([r.metric, ...r.cols]), row(['---', ...r.cols.map(() => '---:')]));
  for (const name of r.rows) lines.push(row([name, ...r.cols.map((c) => fmt(r.table[name][c]))]));
} else if (r.tool === 'verify-claims') {
  lines.push(row(['Claim', 'A', 'B', 'Gap', 'Verdict']), row(['---', '---:', '---:', '---:', '---']));
  for (const c of r.claims) lines.push(row([c.text, fmt(c.a), fmt(c.b), `${c.gap >= 0 ? '+' : ''}${c.gap.toFixed(1)}${c.real ? '' : '~'}`, c.verdict]));
} else {
  throw new Error(`unknown tool in ${file}: ${r.tool}`);
}

const games = r.cells?.[0]?.n ?? r.claims?.[0]?.a?.n ?? r.table?.[r.rows?.[0]]?.[r.cols?.[0]]?.n;
const runsNote = games ? `${games} games per cell` : '';
console.log(`### ${title} (${r.date}${r.git ? `, ${r.git}` : ''})\n`);
console.log(`Measured with ${cmd}${runsNote ? `, ${runsNote}` : ''}. Rates ±1 SE; a gap is real beyond 2 SE of the difference.\n`);
console.log(lines.join('\n'));
console.log('\n<!-- decisions-log row -->');
console.log(row([r.date, `**${title}.** <what changed and why>. Measured (${runsNote || 'see table'}): <before → after>. ${cmd}`]));
