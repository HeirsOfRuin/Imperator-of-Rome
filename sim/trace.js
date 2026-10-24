// Trace one run: node sim/trace.js <seed> <road> <start> <difficulty>
import { play } from './model.js';
const [seed = 1, road = 'military', start = 'GSU', difficulty = 'centurion'] = process.argv.slice(2);
const s = play(Number(seed), { difficulty, road, start, trace: true });
console.log(s.events.join('\n'));
console.log(JSON.stringify(s.outcome), JSON.stringify(s.stats));
