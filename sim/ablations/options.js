// Encounter options: does each of buy / negotiate / fight / bypass carry weight?
// The kill gate measured this on its numbers-only model (prototypes/killgate/ablate.js);
// this runs it on the engine.
const OPTS = ['buy', 'negotiate', 'fight', 'bypass'];
export default {
  runs: 5, by: ['road'], pool: ['start'], fixed: { difficulty: 'centurion' },
  base: {},
  variants: {
    ...Object.fromEntries(OPTS.map((o) => [`no-${o}`, { allowed: OPTS.filter((x) => x !== o) }])),
    ...Object.fromEntries(OPTS.map((o) => [`only-${o}`, { allowed: [o] }])),
  },
  metrics: ['win'],
};
