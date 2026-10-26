// Is every building worth building somewhere? Replaces tools/measure-buildings.js:
// the same 24 campaigns, each building forbidden in turn; a building whose
// absence changes no campaign's end state is decoration.
import { BUILDINGS } from '../../src/data/buildings.js';
import { STARTS } from '../../src/data/world.js';

const N = 6;
const cases = [];
for (const road of ['wealth', 'military', 'politics', 'charisma']) {
  for (let i = 0; i < N; i++) cases.push({ seed: 300 + i * 13, opts: { difficulty: 'centurion', road, start: STARTS[i % STARTS.length] } });
}
export default {
  cases,
  inert: true,
  variants: () => ({
    ...Object.fromEntries(Object.keys(BUILDINGS).map((id) => [id, { noBuilding: [id] }])),
    'no buildings': { noBuildings: true },
  }),
  metrics: ['win'],
};
