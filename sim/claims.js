// Claims the game makes in its copy (SPEC §14, the difficulty blurbs).
// node sim/verify-claims.js sim/claims.js
export default {
  runs: 4, pool: ['start', 'road'],
  claims: [
    { text: 'Centurion is harder than Legionary', metric: 'win', a: { difficulty: 'legionary' }, b: { difficulty: 'centurion' }, expect: '<' },
    { text: 'Legate is harder than Centurion', metric: 'win', a: { difficulty: 'centurion' }, b: { difficulty: 'legate' }, expect: '<' },
    { text: 'The charisma road wins as often as the military road', metric: 'win', a: { difficulty: 'centurion', road: 'military' }, b: { difficulty: 'centurion', road: 'charisma' }, expect: '~' },
  ],
};
