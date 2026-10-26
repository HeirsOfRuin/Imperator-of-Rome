// FRAME-DEPTH: does each depth system matter? Replaces tools/measure-depth.js.
export default {
  runs: 10, by: ['road'], pool: ['start'], fixed: { difficulty: 'centurion' },
  base: {},
  variants: { noSenate: { noSenate: true }, noForeign: { noForeign: true }, noTrade: { noTrade: true } },
  metrics: ['win', 'motions', 'breaches', 'tradeShare'],
};
