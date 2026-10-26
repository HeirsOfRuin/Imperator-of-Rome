// What does each diplomatic tool add? Replaces tools/measure-diplomacy.js.
export default {
  runs: 15, by: ['road'], pool: ['start'], fixed: { difficulty: 'centurion' },
  base: {},
  variants: {
    'all diplomacy off': { noPlayerDiplomacy: true },
    'no truces/alliances': { dipOff: ['truce'] },
    'no submissions': { dipOff: ['submission', 'offers'] },
    'no client kings': { dipOff: ['clients'] },
    'no decree': { dipOff: ['decree'] },
  },
  metrics: ['win'],
};
