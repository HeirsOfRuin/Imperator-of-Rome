// Does background matter without deciding? Each road played with its own
// background and with every other road's background. node sim/background.js [runs] [difficulty]
import { batch } from './run.js';
import { buildBackground } from './model.js';
import { BACKGROUND, STARTS } from './data.js';
const runs = Number(process.argv[2] || 20), d = process.argv[3] || 'centurion';
const roads = ['wealth', 'military', 'politics', 'charisma'];
const bgFor = (road) => Object.fromEntries(BACKGROUND.map((st, i) => [st.stage, buildBackground(road).chosen[i]]));
console.log(`rows: road played; columns: background built for that road (${runs * STARTS.length} runs per cell, ${d})`);
console.log('          ' + roads.map((r) => r.padStart(10)).join(''));
for (const road of roads) {
  const cells = roads.map((bg) => {
    const rows = batch(d, road, STARTS, runs, { background: bgFor(bg) });
    return `${(100 * rows.filter((r) => r.win).length / rows.length).toFixed(1)}%`.padStart(10);
  });
  console.log(road.padEnd(10) + cells.join(''));
}
